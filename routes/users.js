const express = require(`express`)
const router = express.Router()
const fetch = require('node-fetch')
const bodyParser = require('body-parser');
const userSchema = require('../models/users')
const app = express()
const authenticated = require('../util/auth')
const passport = require('passport');
const passesSchema = require('../models/passesSchema')
const promoCodeSchema = require('../models/promoCodeSchema');
const globalSchema = require('../models/globalSchema');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');
const { liveUsers } = require('../ws');
const dayjs = require('dayjs')
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron')
const path = require('node:path')
require('dotenv').config()

app.use(csrf());


//csrf
const csrfProtection = csrf({
    cookie: true
})

exports.csrfProtection = csrfProtection;

app.use(csrfProtection);

app.get('/get-csrf-token', csrfProtection, (req, res) => {
    const csrfToken = req.csrfToken(); // Obtén el token CSRF
    res.json({ csrfToken });
});

function generateCsrfToken(req) {
    return new Promise((resolve, reject) => {
        csrfProtection(req, {}, (err) => {
            if (err) return reject(err);
            resolve(req.csrfToken());
        });
    });
}

const parseForm = bodyParser.urlencoded({ extended: false })

const withdrawLimit = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 10,
    message: async (req, res) => {
        req.flash('error', "Too many withdraw requests from this IP, please try again later")
    }
})


const generateReferralCode = () => {
    return Math.random().toString(36).substr(2, 8);
};

router.get('/', async (req, res, next) => {
    try {
        res.render('home', {
            t: req.t
        });
    } catch (error) {
        next(error);
    }
});

router.get(`/adfaada`, (req, res, next) => {
    res.render(`home`, {
        t: req.t
    })
})

router.get('/sitemap.xml', async (req, res) => {
    res.sendFile(path.join(__dirname, '../sitemap.xml'));
});

router.get("/robots.txt", function (req, res) {
    res.set("Content-Type", "text/plain");
    res.send(`Sitemap: https://rbxplus.com/sitemap.xml`);
});

router.get('/login', csrfProtection, async (req, res, next) => {
    const csrfToken = req.csrfToken();
    console.log(csrfToken);
    res.cookie('csrfToken', csrfToken);
    res.render(`login`, { csrfToken });
  });


router.post('/login', parseForm, async (req, res, next) => {
    try {
        const rblxUser = req.body.username.charAt(0).toUpperCase() + req.body.username.slice(1).toLowerCase();
        const referralCode = req.cookies.referral || null;

        const data = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            body: JSON.stringify({
                "usernames": [rblxUser],
                "excludeBannedUsers": true
            })
        });

        const response = await data.json();
        const userInfo = response.data[0];

        if (!userInfo) {
            req.flash('error', 'Error: Invalid User');
            return res.redirect('/login');
        }

        const { requestedUsername, id, displayName } = userInfo;

        let user = await userSchema.findOne({ user: requestedUsername });

        if (!user) {
            const referringUser = referralCode ? await userSchema.findOne({ referralCode }) : null;

            user = await userSchema.create({
                user: requestedUsername,
                robloxId: id,
                referredBy: referringUser ? referringUser.user : null,
                referralCode: generateReferralCode()
            });
            await user.save();

            if (referringUser) {
                referringUser.totalReferredUsers += 1;
                referringUser.referrals.push({
                    referredUser: user.user,
                    earnings: 0
                });
                await referringUser.save();
            }
        } else if (!user.referralCode) {
            user.referralCode = generateReferralCode();
            await user.save();
        }

        if (!user.tasks) {
            user.tasks = {
                task1: { progress: 0, completed: false, claimed: false },
                task2: { progress: 0, completed: false, claimed: false },
                task3: { progress: 0, completed: false, claimed: false },
                task4: { progress: 0, completed: false, claimed: false },
            };
            await user.save();
        }

        req.session.user = {
            username: requestedUsername,
            displayName: displayName,
            robloxId: id
        };

        req.session.save((err) => {
            if (err) {
                console.error('Error saving session:', err);
                req.flash('error', 'Error al guardar la sesión');
                return res.redirect('/login');
            }
            res.redirect('/profile');
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred during login');
        res.redirect('/login');
    }
});

router.get('/profile', csrfProtection, async (req, res, next) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        const userPoints = await userSchema.findOne({ user: user.username });
        let points = userPoints ? userPoints.points : 0;

        points = roundToDecimals(points, 2);

        const rblxAvatar = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.robloxId}&size=150x150&format=Png&circular=True`);
        const userAvatar = await rblxAvatar.json();
        const { imageUrl } = userAvatar.data[0];

        const rbxUser = await userSchema.findOneAndUpdate({ user: user.username }, {
            imageUrl: imageUrl
        });

        await rbxUser.save();

        const transactions = rbxUser.transactions.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);
        const referralCode = rbxUser.referralCode;
        const totalReferredUsers = rbxUser.totalReferredUsers;
        const referralEarned = roundToDecimals(rbxUser.referralEarned, 2);

        const csrfToken = req.csrfToken(); // Genera el token CSRF

        res.render('profile', {
            user,
            points,
            imageUrl,
            referralCode,
            totalReferredUsers,
            referralEarned,
            success: req.flash('success'),
            error: req.flash('error'),
            transactions,
            dayjs,
            csrfToken // Pasa el token a la vista
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Invalid User');
        res.redirect('/login');
    }
});



router.post('/profile', csrfProtection, async (req, res, next) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        const { code } = req.body;

        const promocode = await promoCodeSchema.findOne({ code: code });
        const userDB = await userSchema.findOne({ user: user.username });

        if (!promocode) {
            req.flash('error', 'Invalid promocode');
            return res.redirect('/profile');
        }

        if (promocode.expired) {
            req.flash('error', 'This promocode has expired');
            return res.redirect('/profile');
        }

        if (promocode.isCreator && userDB.hasRedeemedCreatorCode) {
            req.flash('error', 'You have already redeemed a creator code');
            return res.redirect('/profile');
        }

        if (promocode.redeemedBy.includes(user.username)) {
            req.flash('error', 'You have already redeemed this promocode');
            return res.redirect('/profile');
        }

        promocode.redeemedBy.push(user.username);
        promocode.uses += 1;

        let globalData = await globalSchema.findOne();

        if (!globalData) {
            console.log("No global data found. Creating new record.");
            globalData = new globalSchema({ totalRobux: 0 });
        }

        globalData.totalRobux += promocode.robux;

        if (promocode.uses >= promocode.maxUses) {
            promocode.expired = true;
        }

        console.log("Saving promocode and global data...");
        await promocode.save();
        await globalData.save();

        const robuxDecimal = roundToDecimals(promocode.robux, 2);

        await userSchema.findOneAndUpdate(
            { user: user.username },
            { $inc: { points: robuxDecimal } }
        );

        if (promocode.isCreator) {
            await userSchema.findOneAndUpdate(
                { user: user.username },
                { hasRedeemedCreatorCode: true }
            );
        }

        console.log(`Promocode redeemed by ${user.username}: ${promocode.robux} R$ added.`);
        req.flash('success', `You have redeemed ${promocode.robux} R$`);
        res.redirect('/profile');
    } catch (err) {
        console.error('Error redeeming promocode:', err);
        req.flash('error', 'Error redeeming promocode');
        res.redirect('/profile');
    }
});

router.get(`/logout`, (req, res, next) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error al cerrar sesion:', err)
            return res.redirect('/profile')
        }
        res.redirect('/login')
    })
})

router.get('/ref/:referralCode', async (req, res) => {
    const { referralCode } = req.params;
    console.log(referralCode)

    const referringUser = await userSchema.findOne({ referralCode: referralCode })

    if (referringUser) {
        res.cookie('referral', referralCode, { maxAge: 30 * 24 * 60 * 60 * 1000 })
        res.redirect('/')
    } else {
        return res.status(404).send('Referral code not found.');
    }
})

router.get(`/surveys`, async (req, res, next) => {
    const user = req.session.user;
    if (!user) {
        return res.redirect('/login');
    }

    const username = await userSchema.findOne({ user: user.username });

    if (!username) {
        req.session.destroy();
        return res.redirect('/');
    }

    const hasYouTubeAction = username.actions.some(action => action.action === 'youtube_subscription');
    const hasTikTokAction = username.actions.some(action => action.action === 'tiktok_subscription');
    const hasFbAction = username.actions.some(action => action.action === 'fb_subscription');
    const hasIgAction = username.actions.some(action => action.action === 'ig_subscription');

    res.render(`surveys`, {
        user,
        hasYouTubeAction: hasYouTubeAction,
        hasTikTokAction: hasTikTokAction,
        hasFbAction: hasFbAction,
        hasIgAction: hasIgAction,
    })
})

router.get('/cpx', async (req, res) => {
    try {
        const user = req.query.user.charAt(0).toUpperCase() + req.query.user.slice(1).toLowerCase();
        const offerid = req.query.offerid;
        const reward = parseFloat(req.query.reward);
        const event = req.query.status;

        console.log({
            user,
            offerid,
            reward,
            event
        })

        if (event === '1') {
            const userData = await userSchema.findOne({ user: user });

            if (!userData) {
                return res.status(404).send('User not found');
            }

            userData.points += roundToDecimals(reward, 2)
            userData.pointsAtStartOfDay += roundToDecimals(reward, 2)
            userData.pointsAtStartOfWeek += roundToDecimals(reward, 2);

            userData.tickets += 1

            const tasks = userData.tasks;

            if (!tasks.task1.completed) {
                tasks.task1.progress += 1;
                if (tasks.task1.progress >= 1) {
                    tasks.task1.completed = true;
                }
            }

            if (!tasks.task2.completed) {
                tasks.task2.progress += 1;
                if (tasks.task2.progress >= 3) {
                    tasks.task2.completed = true;
                }
            }

            if (!tasks.task3.completed) {
                tasks.task3.progress += 1;
                if (tasks.task3.progress >= 5) {
                    tasks.task3.completed = true;
                }
            }

            if (!tasks.task4.completed) {
                tasks.task4.progress += 1;
                if (tasks.task4.progress >= 10) {
                    tasks.task4.completed = true;
                }
            }

            await userData.surveys.push({
                userId: user,
                offerId: offerid,
                amount: reward,
                date: new Date(),
                status: 'completed',
            });
            await userData.save();

            let globalData = await globalSchema.findOne();

            if (!globalData) {
                console.log("No global data found. Creating new record.");
                globalData = new globalSchema({ totalRobux: 0 });
            }
            globalData.totalRobux += reward;
            await globalData.save();

            if (userData.referredBy) {
                const referrer = await userSchema.findOne({ user: userData.referredBy });

                if (referrer) {
                    const referrerEarnings = reward * 0.05;
                    referrer.points += referrerEarnings;
                    referrer.referralEarned += referrerEarnings;
                    await referrer.save();
                }
            }



            await fetch('https://discord.com/api/webhooks/1271693004905779274/Xg53ZWZosu-FRt-blQPO4FGKSbEQLpeiRwxOJgKwpGuA8trg_2ycPdYEMSZvRn9bZYyq', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    embeds: [{
                        footer: {
                            text: "RBXPLUS.COM",
                            icon_url: "https://rbxgum.com/static/imgs/logo.png"
                        },
                        description: `${user} completed an offer for ${reward} R$ on **CPX-Research**`,
                        timestamp: new Date().toISOString(),
                        thumbnail: {
                            url: userData.imageUrl
                        },
                        color: 16766208
                    }]
                })
            });

            res.status(200).send('Success');
        } else if (event === '2') {
            console.log('Event cancelled')
            return res.status(400).send('The event was cancelled');
        }
    } catch (error) {
        console.error('Error handling CPX postback:', error);
        res.status(500).send('Server error');
    }
});

router.get('/adgate', async (req, res) => {
    try {
        const user = req.query.user.charAt(0).toUpperCase() + req.query.user.slice(1).toLowerCase();
        const offerid = req.query.offerid;
        const reward = parseFloat(req.query.reward);
        const key = req.query.key;
        const oname = req.query.oname


        if (key !== process.env.ADGATE_API) {
            return res.status(403).send('Invalid key');
        }
        const userData = await userSchema.findOne({ user: user });

        if (!userData) {
            return res.status(404).send('User not found');
        }

        userData.points += roundToDecimals(reward, 2)
        userData.pointsAtStartOfDay += roundToDecimals(reward, 2)
        userData.pointsAtStartOfWeek += roundToDecimals(reward, 2);

        userData.tickets += 1

        const tasks = userData.tasks;

        if (!tasks.task1.completed) {
            tasks.task1.progress += 1;
            if (tasks.task1.progress >= 1) {
                tasks.task1.completed = true;
            }
        }

        if (!tasks.task2.completed) {
            tasks.task2.progress += 1;
            if (tasks.task2.progress >= 3) {
                tasks.task2.completed = true;
            }
        }

        if (!tasks.task3.completed) {
            tasks.task3.progress += 1;
            if (tasks.task3.progress >= 5) {
                tasks.task3.completed = true;
            }
        }

        if (!tasks.task4.completed) {
            tasks.task4.progress += 1;
            if (tasks.task4.progress >= 10) {
                tasks.task4.completed = true;
            }
        }

        await userData.surveys.push({
            userId: user,
            offerId: offerid,
            amount: reward,
            date: new Date(),
            status: 'completed',
        });
        await userData.save();

        let globalData = await globalSchema.findOne();

        if (!globalData) {
            console.log("No global data found. Creating new record.");
            globalData = new globalSchema({ totalRobux: 0 });
        }
        globalData.totalRobux += reward;
        await globalData.save();

        if (userData.referredBy) {
            const referrer = await userSchema.findOne({ user: userData.referredBy });

            if (referrer) {
                const referrerEarnings = reward * 0.05;
                referrer.points += referrerEarnings;
                referrer.referralEarned += referrerEarnings;
                await referrer.save();
            }
        }

        await fetch('https://discord.com/api/webhooks/1271693004905779274/Xg53ZWZosu-FRt-blQPO4FGKSbEQLpeiRwxOJgKwpGuA8trg_2ycPdYEMSZvRn9bZYyq', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                embeds: [{
                    footer: {
                        text: "RBXPLUS.COM",
                        icon_url: "https://rbxgum.com/static/imgs/logo.png"
                    },
                    description: `${user} completed an offer for ${reward} R$ on **AdGate**`,
                    timestamp: new Date().toISOString(),
                    thumbnail: {
                        url: userData.imageUrl
                    },
                    color: 16766208
                }]
            })
        });


        res.status(200).send('Success');
    } catch (error) {
        console.error('Error handling CPX postback:', error);
        res.status(500).send('Server error');
    }
});

router.get('/loot', async (req, res) => {
    try {
        const userId = req.query.user;
        const offerId = req.query.offerid;
        const reward = parseFloat(req.query.reward);
        const key = req.query.key;
        const ip = req.query.ip;

        const rblxUser = userId.charAt(0).toUpperCase() + userId.slice(1).toLowerCase();

        if (key !== process.env.LOOTABLY_API) {
            return res.status(403).send('2'); // Devuelve 2 si la clave es inválida
        }

        const userData = await userSchema.findOne({ user: rblxUser });

        if (!userData) {
            return res.status(404).send('2'); // Devuelve 2 si el usuario no es encontrado
        }

        userData.points += roundToDecimals(reward, 2);
        userData.pointsAtStartOfDay += roundToDecimals(reward, 2);
        userData.pointsAtStartOfWeek += roundToDecimals(reward, 2);

        userData.tickets += 1

        const tasks = userData.tasks;

        if (!tasks.task1.completed) {
            tasks.task1.progress += 1;
            if (tasks.task1.progress >= 1) {
                tasks.task1.completed = true;
            }
        }

        if (!tasks.task2.completed) {
            tasks.task2.progress += 1;
            if (tasks.task2.progress >= 3) {
                tasks.task2.completed = true;
            }
        }

        if (!tasks.task3.completed) {
            tasks.task3.progress += 1;
            if (tasks.task3.progress >= 5) {
                tasks.task3.completed = true;
            }
        }

        if (!tasks.task4.completed) {
            tasks.task4.progress += 1;
            if (tasks.task4.progress >= 10) {
                tasks.task4.completed = true;
            }
        }

        userData.surveys.push({
            userId: userId,
            offerId: offerId,
            amount: parseFloat(reward),
            date: new Date(),
            status: 'completed',
        });

        await userData.save();

        let globalData = await globalSchema.findOne();

        if (!globalData) {
            console.log("No global data found. Creating new record.");
            globalData = new globalSchema({ totalRobux: 0 });
        }
        globalData.totalRobux += reward;
        await globalData.save();

        if (userData.referredBy) {
            const referrer = await userSchema.findOne({ user: userData.referredBy });

            if (referrer) {
                const referrerEarnings = reward * 0.05;
                referrer.points += referrerEarnings;
                referrer.referralEarned += referrerEarnings;
                await referrer.save();
            }
        }

        await fetch('https://discord.com/api/webhooks/1271693004905779274/Xg53ZWZosu-FRt-blQPO4FGKSbEQLpeiRwxOJgKwpGuA8trg_2ycPdYEMSZvRn9bZYyq', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                embeds: [{
                    footer: {
                        text: "RBXPLUS.COM",
                        icon_url: "https://rbxgum.com/static/imgs/logo.png"
                    },
                    description: `${userId} completed an offer for ${reward} R$ on **Lootably**`,
                    timestamp: new Date().toISOString(),
                    thumbnail: {
                        url: userData.imageUrl
                    },
                    color: 16766208
                }]
            })
        });

        return res.status(200).send('1'); // Devuelve 1 si todo fue exitoso
    } catch (error) {
        console.error('Error handling Lootably postback:', error);
        return res.status(500).send('2'); // Devuelve 2 si ocurrió un error en el servidor
    }
});

router.get('/ayet', async (req, res) => {
    try {
        const userId = req.query.user;
        const offerId = req.query.offerid;
        const reward = parseFloat(req.query.reward);
        const key = req.query.key;
        const placementIdentifier = req.query.placement_identifier;
        const payoutUsd = req.query.payout_usd;

        const rblxUser = userId.charAt(0).toUpperCase() + userId.slice(1).toLowerCase();


        if (key !== process.env.AYET_API) {
            return res.status(403).send('Invalid key');
        }

        const userData = await userSchema.findOne({ user: rblxUser });

        if (!userData) {
            return res.status(404).send('User not found');
        }

        userData.points += roundToDecimals(reward, 2);
        userData.pointsAtStartOfDay += roundToDecimals(reward, 2);
        userData.pointsAtStartOfWeek += roundToDecimals(reward, 2);

        userData.tickets += 1

        const tasks = userData.tasks;

        if (!tasks.task1.completed) {
            tasks.task1.progress += 1;
            if (tasks.task1.progress >= 1) {
                tasks.task1.completed = true;
            }
        }

        if (!tasks.task2.completed) {
            tasks.task2.progress += 1;
            if (tasks.task2.progress >= 3) {
                tasks.task2.completed = true;
            }
        }

        if (!tasks.task3.completed) {
            tasks.task3.progress += 1;
            if (tasks.task3.progress >= 5) {
                tasks.task3.completed = true;
            }
        }

        if (!tasks.task4.completed) {
            tasks.task4.progress += 1;
            if (tasks.task4.progress >= 10) {
                tasks.task4.completed = true;
            }
        }

        userData.surveys.push({
            userId: userId,
            offerId: offerId,
            amount: parseFloat(reward),
            date: new Date(),
            status: 'completed',
        });

        await userData.save();

        let globalData = await globalSchema.findOne();

        if (!globalData) {
            console.log("No global data found. Creating new record.");
            globalData = new globalSchema({ totalRobux: 0 });
        }
        globalData.totalRobux += reward;
        await globalData.save();

        if (userData.referredBy) {
            const referrer = await userSchema.findOne({ user: userData.referredBy });

            if (referrer) {
                const referrerEarnings = reward * 0.05;
                referrer.points += referrerEarnings;
                referrer.referralEarned += referrerEarnings;
                await referrer.save();
            }
        }

        await fetch('https://discord.com/api/webhooks/1271693004905779274/Xg53ZWZosu-FRt-blQPO4FGKSbEQLpeiRwxOJgKwpGuA8trg_2ycPdYEMSZvRn9bZYyq', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                embeds: [{
                    footer: {
                        text: "RBXPLUS.COM",
                        icon_url: "https://rbxgum.com/static/imgs/logo.png"
                    },
                    description: `${userId} completed an offer for ${reward} R$ on **Ayet**`,
                    timestamp: new Date().toISOString(),
                    thumbnail: {
                        url: userData.imageUrl
                    },
                    color: 16766208
                }]
            })
        });

        return res.status(200).send('1'); // Devuelve 1 si todo fue exitoso
    } catch (error) {
        console.error('Error handling Ayet postback:', error);
        return res.status(500).send('2'); // Devuelve 2 si ocurrió un error en el servidor
    }
});




router.get(`/withdraw`, async (req, res, next) => {
    const user = req.session.user;
    if (!user) {
        return res.redirect('/login');
    }

    res.render(`withdraw`)
})

router.post('/withdraw', parseForm, csrfProtection, async (req, res) => {
    const passesSchema = require('../models/passesSchema');

    const user = req.session.user;
    if (!user) {
        return res.redirect('/login');
    }

    const amount = parseFloat(req.body.amount);
    const feePercentage = 0.30;
    const totalAmount = Math.floor((amount / (1 - feePercentage)));
    const userData = await userSchema.findOne({ user: user.username });

    req.session.robuxAmount = totalAmount;
    req.session.amount = amount;

    if (userData.points < amount) {
        req.flash('error', 'Not enough funds');
        return res.redirect('/withdraw');
    }

    if (amount >= 35) {
        res.redirect('/selectgame');
    } else {
        req.flash('error', 'You must enter an ammount of at least 35 R$');
        res.redirect('/withdraw');
    }
});

router.get(`/faq`, (req, res, next) => {
    res.render(`faq`)
})

router.get('/selectgame', async (req, res, next) => {
    try {
        const user = req.session.user;
        const robuxAmount = req.session.robuxAmount;



        if (!user || !robuxAmount) {
            return res.redirect('/withdraw');
        }

        const rblxGames = await fetch(`https://games.roblox.com/v2/users/${user.robloxId}/games?accessFilter=2&limit=10&sortOrder=Asc`)

        const userGames = await rblxGames.json();
        const games = Array.isArray(userGames.data) ? userGames.data : [userGames.data];

        for (const game of games) {
            const getImageUrlResponse = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${game.id}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`);
            const imageURL = await getImageUrlResponse.json();
            const url = imageURL.data[0];
            game.imageUrl = url.imageUrl;
        }

        res.render('selectGame', {
            name: user.displayName,
            imageUrl: user.imageUrl,
            games: games,
        })
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while fetching games');
        res.redirect('/withdraw');
    }
})

router.post('/selectgame', parseForm, csrfProtection, async (req, res, next) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        const { gameID } = req.body;

        req.session.gameID = gameID;

        //if(game.robuxAmount !== gamePrice.data[0].price){
        //  req.flash('error', 'The game price does not match the amount of Robux to withdraw.');
        // return res.redirect('/selectgame');;
        //} else if(game.robuxAmount > gamePrice.data[0].price) {
        //  req.flash('error', 'The game price is greater than the amount of withdraw');
        //return res.redirect('/selectgame');;
        //} else if(game.robuxAmount && gamePrice.data[0].price === null){
        //  req.flash('error', 'Set a valid game price');
        // return res.redirect('/selectgame');;
        //}

        req.flash('success', 'Game selected successfully!');
        res.redirect(`/game/createpass`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while selecting the game');
        res.redirect('/withdraw');
    }
});

router.get('/game/createpass', async (req, res) => {
    const user = req.session.user;
    if (!user) {
        return res.redirect('/login');
    }

    const robuxAmount = req.session.robuxAmount || 0;

    const gameId = req.session.gameID || null

    res.render('createpass', {
        amount: robuxAmount,
        id: gameId,
    })
})

router.get('/game/selectpass', async (req, res) => {
    try {
        const user = req.session.user;
        const gameID = req.session.gameID;
        const robuxAmount = req.session.robuxAmount;

        if (!user || !gameID || !robuxAmount) {
            return res.redirect('/withdraw');
        }

        const now = Date.now();
        const lastRequestTime = req.session.lastWithdrawRequestTime || 0;
        const timeSinceLastRequest = now - lastRequestTime;
        const withdrawInterval = 1 * 60 * 1000; // 1 minuto

        if (timeSinceLastRequest <= withdrawInterval) {
            req.flash('error', 'Please wait a few minutes before making another withdrawal');
            return res.redirect('/withdraw');
        }

        const data = await passesSchema.findOne({ username: user.username });
        const fetchGamePasses = await fetch(`https://games.roblox.com/v1/games/${gameID}/game-passes?limit=20&sortOrder=1`);
        const gamePasses = await fetchGamePasses.json();

        const userpass = Array.isArray(gamePasses.data) ? gamePasses.data : [gamePasses.data];

        for (const game of userpass) {
            const getImageUrlResponse = await fetch(`https://thumbnails.roblox.com/v1/game-passes?gamePassIds=${game.id}&size=150x150&format=Png&isCircular=false`);
            const imageURL = await getImageUrlResponse.json();
            const url = imageURL.data[0];
            game.imageUrl = url.imageUrl;
        }

        res.render('selectpass', {
            passes: gamePasses.data,
        });
    } catch (err) {
        console.error(err);
    }
});

router.post('/game/selectpass', parseForm, withdrawLimit, csrfProtection, async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        const now = Date.now();
        const lastRequestTime = req.session.lastWithdrawRequestTime || 0;
        const timeSinceLastRequest = now - lastRequestTime;

        const withdrawInterval = 1 * 60 * 1000;

        if (timeSinceLastRequest <= withdrawInterval) {
            req.flash('error', 'Please wait a few minutes before making another withdrawal');
            return res.redirect('/withdraw');
        }

        req.session.lastWithdrawRequestTime = now;

        const { passName, passId, passPrice, passImage } = req.body;
        const gameID = req.session.gameID;

        const fetchGamePasses = await fetch(`https://games.roblox.com/v1/games/${gameID}/game-passes?limit=20&sortOrder=1`);
        const gamePasses = await fetchGamePasses.json();
        const selectedPass = gamePasses.data.find(pass => pass.id === parseInt(passId));

        const rblxUser = await userSchema.findOne({ user: user.username });

        const robuxAmount = req.session.amount;
        const actualPassPrice = selectedPass.price;

        const totalAmountNeeded = Math.floor((actualPassPrice / (1 - 0.30))); // Considerando impuestos

        // Verificar si el usuario aún tiene fondos suficientes
        if (rblxUser.points < robuxAmount) {
            req.flash('error', `You do not have enough Robux. Your balance is ${rblxUser.points} R$`);
            return res.redirect('/withdraw');
        }

        if (req.session.robuxAmount !== selectedPass.price) {
            req.flash('error', 'The game price does not match the amount of Robux to withdraw');
            return res.redirect('/withdraw');
        } else if (req.session.robuxAmount > selectedPass.price) {
            req.flash('error', 'The game price is greater than the amount of withdraw');
            return res.redirect('/withdraw');
        } else if (req.session.robuxAmount && selectedPass.price === null) {
            req.flash('error', 'Set a valid game price');
            return res.redirect('/withdraw');
        }



        // Restar los fondos del saldo del usuario
        rblxUser.points -= robuxAmount;

        const uniqueId = uuidv4();

        const data = await passesSchema.create({
            username: user.username,
            gameId: req.session.gameID,
            robuxAmount: req.session.robuxAmount,
            passName: selectedPass.name,
            passId: selectedPass.id,
            passPrice: selectedPass.price,
            passImage: passImage[0],
            id: uniqueId
        })

        await data.save()


        const newTransaction = {
            username: user.username,
            robuxAmount: req.session.amount,
            status: 'pending',
            passName: selectedPass.name,
            passId: selectedPass.id,
            passPrice: selectedPass.price,
            passImage: passImage[0],
            date: new Date(),
            transactionId: uniqueId
        };

        rblxUser.transactions.push(newTransaction);
        await rblxUser.save();

        req.flash('success', 'Withdrawal successful. You will receive a transaction within 24 hours.');
        res.redirect('/profile');
    } catch (err) {
        console.log('Error', err);
        req.flash('error', 'An error occurred.');
        res.redirect('/game/selectpass');
    }
});


router.get(`/notifi`, (req, res) => {
    res.render(`notifications`)
})

let dailyUsersCache = [];
let weeklyUsersCache = [];


cron.schedule('*/5 * * * *', async () => {
    await updateDailyUsers();
    await updateWeeklyUsers();
});


cron.schedule('0 0 * * *', async () => {
    await resetDailyUsers();
    await userSchema.updateMany({}, { $set: { pointsAtStartOfDay: 0 } });
    await updateDailyUsers();
});


cron.schedule('0 0 * * 0', async () => {
    await resetWeeklyUsers();
    await userSchema.updateMany({}, { $set: { pointsAtStartOfWeek: 0 } });
    await updateWeeklyUsers();
});

async function updateDailyUsers() {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(startOfDay.getDate() + 1);

        const users = await userSchema.aggregate([
            {
                $match: {
                    updatedAt: { $gte: startOfDay, $lt: endOfDay }
                }
            },
            {
                $group: {
                    _id: "$user",
                    username: { $first: "$user" },
                    totalPoints: { $first: "$pointsAtStartOfDay" },
                    imageUrl: { $first: "$imageUrl" }
                }
            },
            {
                $sort: { totalPoints: -1 }
            },
            {
                $limit: 3
            }
        ]);


        dailyUsersCache = users
            .filter(user => user.totalPoints > 0)
            .map(user => ({
                username: user.username.substring(0, 6),
                points: Math.round(user.totalPoints),
                imageUrl: user.imageUrl,
            }));

        await sendDailyRanking(dailyUsersCache);
        console.log('Daily users updated:', dailyUsersCache);
    } catch (err) {
        console.error('Error updating daily users:', err);
    }
}

async function updateWeeklyUsers() {
    try {
        const startOfWeek = new Date();
        startOfWeek.setHours(0, 0, 0, 0);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7);

        const users = await userSchema.aggregate([
            {
                $match: {
                    updatedAt: { $gte: startOfWeek, $lt: endOfWeek }
                }
            },
            {
                $group: {
                    _id: "$user",
                    username: { $first: "$user" },
                    totalPoints: { $first: "$pointsAtStartOfWeek" },
                    imageUrl: { $first: "$imageUrl" }
                }
            },
            {
                $sort: { totalPoints: -1 }
            },
            {
                $limit: 7
            }
        ]);


        weeklyUsersCache = users
            .filter(user => user.totalPoints > 0)
            .map(user => ({
                username: user.username.substring(0, 6),
                points: Math.round(user.totalPoints),
                imageUrl: user.imageUrl,
            }));

        await sendWeeklyRanking(weeklyUsersCache);
        console.log('Weekly users updated:', weeklyUsersCache);
    } catch (err) {
        console.error('Error updating weekly users:', err);
    }
}
async function resetDailyUsers() {
    dailyUsersCache = [];
    console.log('Daily leaderboard reset');
}

async function resetWeeklyUsers() {
    weeklyUsersCache = [];
    console.log('Weekly leaderboard reset');
}

async function sendDailyRanking(dailyUsers) {
    await fetch('https://discord.com/api/webhooks/1272117204850311251/_hoNxxD-W2taF1SyFZ8sp4vjERQOObjSaC5-GAC9q_7brfMbENNbaK3ySuPcJNqWLOce', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            embeds: dailyUsers.map((user, index) => ({
                footer: {
                    text: "RBXPLUS.COM",
                    icon_url: "https://rbxgum.com/static/imgs/logo.png"
                },
                title: `#${index + 1} - ${user.username}`,
                description: `**Puntos**: ${Math.round(user.points)} R$`,
                timestamp: new Date().toISOString(),
                thumbnail: {
                    url: user.imageUrl
                },
                color: 16766208
            }))
        })
    });
}

async function sendWeeklyRanking(weeklyUsers) {
    await fetch('https://discord.com/api/webhooks/1272117338866712597/eDbPsVf33CYy8zRCpS8UGgVV31ERLkVoSeYvhW2ee4M01uTuXEl9oCGB0ESDSh6ad86j', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            embeds: weeklyUsers.map((user, index) => ({
                footer: {
                    text: "RBXPLUS.COM",
                    icon_url: "https://rbxgum.com/static/imgs/logo.png"
                },
                title: `#${index + 1} - ${user.username}`,
                description: `**Puntos**: ${Math.round(user.points)} R$`,
                timestamp: new Date().toISOString(),
                thumbnail: {
                    url: user.imageUrl
                },
                color: 16766208
            }))
        })
    });
}

router.get('/ranking', async (req, res) => {
    const user = req.session.user;
    if (!user) {
        return res.redirect('/login');
    }

    res.render('ranking', {
        dailyUsers: dailyUsersCache,
        weeklyUsers: weeklyUsersCache
    });
});


router.post('/youtube', parseForm, csrfProtection, async (req, res, next) => {
    try {

        const user = req.session.user;

        if (!user) {

            return res.redirect('/');
        }


        const username = await userSchema.findOne({ user: user.username });

        if (!username) {
            req.session.destroy();
            return res.redirect('/');
        }


        const hasAction = username.actions.some(action => action.action === 'youtube_subscription');

        if (hasAction) {
            return req.flash('error', 'You have already completed this task!')
        }


        username.points += 0.5;
        username.actions.push({ action: 'youtube_subscription' });
        await username.save();


        res.json({ redirectUrl: 'https://youtu.be/61vLoPZ_zZk?si=hamjgzvNxduHE1hE', message: 'Reward received!' });

    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        next(error);
    }
});

router.post('/tiktok', parseForm, csrfProtection, async (req, res, next) => {
    try {

        const user = req.session.user;

        if (!user) {

            return res.redirect('/');
        }


        const username = await userSchema.findOne({ user: user.username });

        if (!username) {
            req.session.destroy();
            return res.redirect('/');
        }


        const hasAction = username.actions.some(action => action.action === 'tiktok_subscription');

        if (hasAction) {
            return req.flash('error', 'You have already completed this task!')
        }


        username.points += 0.5;
        username.actions.push({ action: 'tiktok_subscription' });
        await username.save();


        res.json({ redirectUrl: 'https://www.tiktok.com/@rbxplus_', message: 'Reward received!' });

    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        next(error);
    }
});

router.post('/facebook', parseForm, csrfProtection, async (req, res, next) => {
    try {

        const user = req.session.user;

        if (!user) {

            return res.redirect('/');
        }


        const username = await userSchema.findOne({ user: user.username });

        if (!username) {
            req.session.destroy();
            return res.redirect('/');
        }


        const hasAction = username.actions.some(action => action.action === 'fb_subscription');

        if (hasAction) {
            return req.flash('error', 'You have already completed this task!')
        }


        username.points += 0.5;
        username.actions.push({ action: 'fb_subscription' });
        await username.save();


        res.json({ redirectUrl: 'https://www.facebook.com/rbxplus/', message: 'Reward received!' });

    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        next(error);
    }
});

router.post('/instagram', parseForm, csrfProtection, async (req, res, next) => {
    try {

        const user = req.session.user;

        if (!user) {

            return res.redirect('/');
        }


        const username = await userSchema.findOne({ user: user.username });

        if (!username) {
            req.session.destroy();
            return res.redirect('/');
        }


        const hasAction = username.actions.some(action => action.action === 'ig_subscription');

        if (hasAction) {
            return req.flash('error', 'You have already completed this task!')
        }


        username.points += 0.5;
        username.actions.push({ action: 'ig_subscription' });
        await username.save();


        res.json({ redirectUrl: 'https://www.instagram.com/rbxplus_/', message: 'Reward received!' });

    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        next(error);
    }
});


router.get('/goal', async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        const globalData = await globalSchema.findOne();

        res.render('goal', {
            totalRobuxDonated: globalData ? globalData.totalRobux : 0
        })
    } catch (error) {
        console.error('Error fetching total Robux donated:', error);
        res.status(500).send('Server error');
    }
});


app.post('/cron/reset-tasks', csrfProtection, async (req, res) => {
    try {
        const csrfToken = req.csrfToken();
        const response = await fetch('http://localhost/tasks/reset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CSRF-Token': csrfToken
            },
            credentials: 'include'
        });

        // Handle response...
        res.json({ success: true });
    } catch (error) {
        console.error('Error resetting tasks:', error);
        res.status(500).json({ success: false, message: 'Error resetting tasks' });
    }
});

// Then in your cron job:
cron.schedule('*/1 * * * *', async () => {
    try {
        await fetch('http://localhost/cron/reset-tasks', {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Error resetting tasks:', error);
    }
});



router.get('/extra', csrfProtection, async (req, res, next) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        res.render('extra', { csrfToken: req.csrfToken() });
    } catch (error) {
        next(error);
    }
});


router.get('/tasks/status', async (req, res, next) => {
    try {
        const userId = req.session.user;
        const user = await userSchema.findOne({ user: userId.username });

        if (!user && !userId) {
            res.redirect('/login')
            return res.status(404).send('User not found');
        }

        const now = new Date();
        const nextReset = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
        const timeRemaining = nextReset - now;
        const tasks = user.tasks;

        res.json({
            tasks,
            timeRemaining,
        });
    } catch (error) {
        console.error('Error fetching tasks status:', error);
        res.status(500).send('Server error');
    }
})

router.post('/tasks/claim', csrfProtection, async (req, res) => {
    try {
        const { taskId } = req.body;
        console.log(taskId);
        const userId = req.session.user;

        const user = await userSchema.findOne({ user: userId.username });
        if (!user) return res.status(404).send('User not found');


        const task = user.tasks[`task${taskId}`];

        if (task.claimed) {
            req.flash('error', 'Task has already been claimed.');
            return res.redirect('/extra');
        }

        task.claimed = true;


        let reward = 0
        const taskNumber = parseInt(taskId, 10);

        switch (taskNumber) {
            case 1:
                reward = 0.5
                user.points += reward;
                break;
            case 2:
                reward = 1.5
                user.points += reward;
                break;
            case 3:
                reward = 3
                user.points += reward;
                break;
            case 4:
                reward = 5
                user.points += reward;
                break;
            default:
                req.flash('error', 'Invalid task number!')
                return res.redirect('/extra')
        }

        await user.save();
        req.flash('success', `You earned ${reward} R$`)
        return res.redirect('/extra')
    } catch (error) {
        console.error('Error claiming reward:', error);
        req.flash('error', 'There was an error claiming reward')
    }
});

router.post('/tasks/reset', csrfProtection, async (req, res, next) => {
    try {
        await userSchema.updateMany({}, {
            $set: {
                'tasks.task1.progress': 0,
                'tasks.task1.claimed': false,
                'tasks.task1.completed': false,
                'tasks.task2.progress': 0,
                'tasks.task2.claimed': false,
                'tasks.task2.completed': false,
                'tasks.task3.progress': 0,
                'tasks.task3.claimed': false,
                'tasks.task3.completed': false,
                'tasks.task4.progress': 0,
                'tasks.task4.claimed': false,
                'tasks.task4.completed': false,
            }
        });

        res.status(200).json({ success: true, message: 'Tasks reset successfully', csrfToken: req.csrfToken() });
    } catch (error) {
        console.error('Error resetting tasks:', error);
        res.status(500).json({ success: false, message: 'Failed to reset tasks' });
    }
});

router.get('/games', async (req, res, next) => {
    try {

        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        const robloxUser = await userSchema.findOne({ user: user.username })

        if (!robloxUser) {
            return res.redirect('/login')
        }

        const tickets = robloxUser.tickets;

        res.render('gamesection', {
            user,
            tickets,
        })
    } catch (err) {
        console.log(err)
    }
})

router.get('/games/mines', async (req, res, next) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        res.render('mines', {
            user,
        })
    } catch (err) {
        console.log(err)
    }
})

router.post('/games/mines', parseForm, csrfProtection, async (req, res, next) => {
    try {
        const user = req.session.user;
        const ticketCost = 6;
        const robloxUser = await userSchema.findOne({ user: user.username });

        if (!robloxUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (robloxUser.tickets >= ticketCost) {
            // Deduct the ticket cost and save the user
            robloxUser.tickets -= ticketCost;
            await robloxUser.save();

            // Render the 'mines' view if the user has enough tickets
            return res.status(200).json({ hasTickets: true })
        } else {
            // Respond with an error message if not enough tickets
            return res.status(400).json({ success: false, message: 'Not enough tickets' });
        }
    } catch (err) {
        // Handle any unexpected errors
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/games/mines/withdraw', parseForm, csrfProtection, async (req, res, next) => {
    try {
        const { robux, robloxUser } = req.body;
        console.log(robux)

        if (!robux || !robloxUser) {
            return res.status(400).json({ success: false, message: 'Invalid data' });
        }

        const user = await userSchema.findOne({ user: robloxUser });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.points = (user.points || 0) + robux;

        await user.save();

        res.json({ success: true, message: 'Withdraw successfull', points: user.points });
    } catch (err) {
        console.error('Error en la solicitud de retiro:', err);
        res.status(500).json({ success: false, message: 'Interal Server Error' });
    }
})

router.post('/games/mines/balance', parseForm, csrfProtection, async (req, res, next) => {
    try {
        const { username, robux } = req.body;

        console.log(robux)

        const user = await userSchema.findOne({ user: username });

        if (!user) {
            return res.status(400).json({ success: false, message: 'User not found' });
        }


        user.points += robux;

        // Guarda los cambios en la base de datos
        await user.save();

        // Responde con el nuevo balance del usuario
        res.json({ success: true, newBalance: user.points, oldBalance: robux });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'An error ocurred trying save balance' });
    }
});

function roundToDecimals(number, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(number * factor) / factor;
}
//ACA ESTA EL PLINKO, EL Q LO LEA ES GAY

router.get('/games/plinko', async (req, res, next) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        res.render('plinko', {
            user,
        })
    } catch (err) {
        console.log(err)
    }
})

router.post('/games/plinko', parseForm, csrfProtection, async (req, res, next) => {
    try {
        const user = req.session.user;
        const { numberOfBalls } = req.body;
        const robloxUser = await userSchema.findOne({ user: user.username });

        if (!robloxUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const totalTicketsNeeded = numberOfBalls * 2;

        if (robloxUser.tickets >= totalTicketsNeeded) {
            // Render the 'mines' view if the user has enough tickets
            return res.status(200).json({ hasTickets: true })
        } else {
            // Respond with an error message if not enough tickets
            return res.status(400).json({ success: false, message: 'Not enough tickets' });
        }
    } catch (err) {
        // Handle any unexpected errors
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/games/plinko/deduct-tickets', parseForm, csrfProtection, async (req, res, next) => {
    try {
        const user = req.session.user;
        const { numberOfBalls } = req.body;
        const robloxUser = await userSchema.findOne({ user: user.username });

        if (!robloxUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const totalTicketsNeeded = numberOfBalls * 2;

        if (robloxUser.tickets >= totalTicketsNeeded) {
            robloxUser.tickets -= totalTicketsNeeded;
            await robloxUser.save();

            // Render the 'mines' view if the user has enough tickets
            return res.status(200).json({ success: true })
        } else {
            // Respond with an error message if not enough tickets
            return res.status(400).json({ success: false, message: 'Not enough tickets' });
        }
    } catch (err) {
        // Handle any unexpected errors
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/games/plinko/balance', parseForm, csrfProtection, async (req, res, next) => {
    try {
        const { username, earnedRobux } = req.body;



        const user = await userSchema.findOne({ user: username });

        if (!user) {
            return res.status(400).json({ success: false, message: 'User not found' });
        }

        const userAgent = req.get('User-Agent');
        const allowedAgents = ['Chrome', 'Firefox', 'Safari', 'Edge', 'Brave'];
        const isWebClient = allowedAgents.some(agent => userAgent.includes(agent));


        if (!isWebClient) {
            return res.status(403).json({ success: false, message: 'Acceso no autorizado, solo se permite acceso desde un cliente web.' });
        }


        user.points += earnedRobux;

        // Guarda los cambios en la base de datos
        await user.save();

        // Responde con el nuevo balance del usuario
        res.json({ success: true, newBalance: user.points, oldBalance: earnedRobux });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'An error ocurred trying save balance' });
    }
});


module.exports = router
