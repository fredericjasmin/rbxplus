const express = require(`express`)
const router = express.Router()
const fetch = require('node-fetch')
const bodyParser = require('body-parser');
const userSchema = require('../models/users')
const authenticated = require('../util/auth')
const passport = require('passport');
const passesSchema = require('../models/passesSchema')
const promoCodeSchema = require('../models/promoCodeSchema');
const globalSchema = require('../models/globalSchema');
const rateLimit = require('express-rate-limit');
const Admin = require('../models/adminSchema');
const jwt = require('jsonwebtoken');
const { liveUsers } = require('../ws');
const dayjs = require('dayjs')
const csrf = require('csurf')
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron')
require('dotenv').config()

router.get('/create', async (req, res, next) => {
    try {
        res.render('admin/create')
    } catch (err) {
        console.error('Error al crear el administrador:', err);
        res.status(500).send('Error al crear el administrador');
    }
})

router.post('/create', async (req, res, next) => {
    try {
        const { username, password, email, role } = req.body;

        // Verifica si el administrador ya existe
        const adminExists = await Admin.findOne({ username });

        if (adminExists) {
            return res.status(400).send('El administrador con ese nombre de usuario ya existe.');
        }

        // Crear un nuevo administrador
        const newAdmin = new Admin({
            username,
            password,
            email,
            role
        });
        await newAdmin.save();
        console.log(`Administrador ${username} creado exitosamente`);

        res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqw'); // Redirige de vuelta al formulario
    } catch (err) {
        console.error('Error al crear el administrador:', err);
        res.status(500).send('Error al crear el administrador');
    }
})


router.get('/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqw',async (req, res, next) => {
    try {
        res.render('admin/admin');
    } catch (err) {
        console.error('Error al crear el administrador:', err);
        res.status(500).send('Error al crear el administrador');
    }
})

router.post('/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqw', async (req, res, next) => {
    try {
        const { username, password } = req.body;

        const admin = await Admin.findOne({ username: username });

        if (!admin) {
            return res.status(401).json({ message: 'Nombre de usuario o contraseña incorrectos.' });
        }

        const isMatch = await admin.verifyPassword(password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Nombre de usuario o contraseña incorrectos.' });
        }

        const payload = { id: admin._id, role: admin.role };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

       
        res.json({ token });
    } catch (err) {
        next(err);
    }
});
router.get('/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad',  async (req, res, next) => {
    try {
        const totalUsers = await userSchema.countDocuments({})

        const activePeriod = new Date(Date.now() - 1 * 60 * 1000);

        const liveUsers = await userSchema.countDocuments({ lastActivity: { $gte: activePeriod } });

        res.render('admin/dashboard', {
            totalUsers,
            liveUsers
        })
    } catch (e) {

    }
})

router.get('/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/withdraws',  async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;

        
        const pendingWithdraws = await passesSchema.find({ waitingForPayment: 'true' })
            .skip((page - 1) * limit)
            .limit(limit);
        
        
        const totalWithdraws = await passesSchema.countDocuments({ waitingForPayment: 'true' });

        res.render('admin/withdraws', {
            withdraws: pendingWithdraws,
            currentPage: page,
            totalPages: Math.ceil(totalWithdraws / limit),
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred while fetching withdraws.');
        res.redirect('/profile');
    }
});

router.post('/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/withdraws', async (req, res) => {
    const { withdrawId } = req.body;
    console.log(withdrawId);

    try {
      
        const user = await userSchema.findOne({ username: req.session.username });

        if (!user) {
            req.flash('error', 'User not found.');
            return res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/withdraws');
        }


        const gamepass = await passesSchema.findOne({ id: withdrawId });

        if (!gamepass) {
            req.flash('error', 'Gamepass not found.');
            return res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/withdraws');
        }

     
        const transactionUpdate = await userSchema.updateOne(
            {
                username: req.session.username,
                'transactions.transactionId': withdrawId, 
                'transactions.status': 'pending'
            },
            {
                $set: { 'transactions.$.status': 'completed' }
            }
        );

        if (transactionUpdate.modifiedCount > 0) {
            console.log('Transaction updated successfully for user:', req.session.username);
        } else {
            req.flash('error', 'Failed to update the transaction status.');
            return res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/withdraws');
        }


        await passesSchema.findOneAndUpdate({ id: withdrawId }, {
            waitingForPayment: false,
            paid: true
        });

        req.flash('success', 'Transaction and gamepass updated successfully!');
        res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/withdraws');
    } catch (error) {
        console.error('Error updating withdraw:', error);
        res.status(500).send('Server error');
    }
});

router.get('/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/users',  async (req, res, next) => {
    const searchQuery = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 20;

    try {
        const users = await userSchema.find({ user: new RegExp(searchQuery, 'i') })
            .skip((page - 1) * limit)
            .limit(limit);
        const totalUsers = await userSchema.countDocuments({ user: new RegExp(searchQuery, 'i') });

        res.render('admin/users', {
            users,
            searchQuery,
            currentPage: page,
            totalPages: Math.ceil(totalUsers / limit),
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
})

router.get('/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/users/:robloxId/view',  async (req, res, next) => {
    try {
        const { robloxId } = req.params;


        const user = await userSchema.findOne({ robloxId: robloxId });

        if (!user) {
            req.flash('error', 'User not found');
            return res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwoqwqwfjqwasdasdad/admin/users');
        }

       
        const arrTrans = Array.isArray(user.transactions) ? user.transactions : [];

        res.render('admin/viewUser', {
            user,
            arrTrans,
            dayjs,
        });
    } catch (error) {
        console.error('Error fetching user or transactions:', error);
        req.flash('error', 'An error occurred while retrieving user details');
        res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/users');
    }
});


router.post('/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/users/:robloxId/view', async (req, res, next) => {

    try {
        const { robloxId } = req.params;
    const user = await userSchema.findOne({ robloxId: robloxId})
    const { points } = req.body;

    if(user){
        user.points = points;
        await user.save();
        req.flash('success', 'Points updated successfully.');
        res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/users')
    } else {
        req.flash('error', 'User not found.');
    }

    const arrTrans = Array.isArray(user.transactions) ? user.transactions : [];

    res.render('admin/viewUser', {
        user,
        arrTrans,
        dayjs
    })
    } catch (err) {
        req.flash('error', 'There was an error.')
        res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/users/:robloxId/view')
    }
})


router.get("/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/users/:username",  async (req, res) => {
    try {
        const searchQuery = req.params.username.toLowerCase();
        
        let users = await userSchema.find();
        users = users.filter(user => user.user.toLowerCase().includes(searchQuery));

        res.json(users);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Error fetching users');
        res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin');
    }
});

router.get("/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/promocodes",  async (req, res) => {
    try {
        const promocodes = await promoCodeSchema.find()

        res.render('admin/promocodes', {
            promocodes,
            dayjs,
        })
    } catch (err) {
        console.error(err);
        req.flash('error', 'Error');
        res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin');
    }
});

router.post("/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/promocodes", async (req, res) => {
    try {
        const { amount: robux, name, maxUses, creatorCode } = req.body;

        const isCreatorCode = req.body.creatorCode ? true : false;
        console.log(isCreatorCode)

        const newPromocode = await promoCodeSchema.create({ code: name, maxUses, robux, isCreator: isCreatorCode });

        if (newPromocode) {
            req.flash('success', 'The promocode was successfully saved');
            return res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/promocodes');
        }
    } catch (err) {
        console.error(err);
        req.flash('error', 'Error');
        return res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad');
    }
});

router.get('/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/promocodes/view', async (req, res) => {
    try {
        const promocodes = await promoCodeSchema.find()
        res.render('admin/allpromocodes', {
            promocodes,
            dayjs,
            csrfToken
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Error');
        res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad');
    }
});

router.post('/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/promocodes/delete', async (req, res) => {
    try {
        const { code: name } = req.body;

        const result = await promoCodeSchema.findOneAndDelete({ code: name });

        if (!result) {
            req.flash('error', 'Promocode not found');
        } else {
            req.flash('success', 'Promocode deleted successfully');
        }

        res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/promocodes/view');
    } catch (e) {
        console.error('Error al eliminar el promocode:', e);
        req.flash('error', 'Error');
        res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad');
    }
});

router.post('/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/promocodes/update', async (req, res) => {
    try {
        const { name, maxUses, amount, oldName} = req.body;

        const isCreatorCode = req.body.creatorCode === 'true';

        const promocode = await promoCodeSchema.findOneAndUpdate(
            { code: oldName },
            { code: name, maxUses, robux: amount, expired: false, isCreator: isCreatorCode },
            { new: true }
        );

        if (!promocode) {
            req.flash('error', 'Promocode not found');
            return res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad');
        } else {
            req.flash('success', 'Promocode updated successfully');
            return res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad/admin/promocodes/view');
        }
    } catch (err) {
        console.error('Error al actualizar el promocode:', err);
        req.flash('error', 'Error');
        return res.redirect('/admin/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqwasdasdad');
    }
});

router.get('/verify-token/:token', (req, res) => {
    const token = req.params.token;

    try {
        // Verificar el token
        jwt.verify(token, process.env.JWT_SECRET);
        res.json({ valid: true });
    } catch (error) {
        res.json({ valid: false });
    }
});

module.exports = router