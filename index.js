const express = require(`express`)
const path = require(`path`)
const morgan = require(`morgan`)
const app = express()
const ejs = require(`ejs`)
const flash = require(`connect-flash`)
const session = require(`express-session`)
const axios = require(`axios`)
const passport = require(`passport`)
const WebSocket = require('ws')
const rateLimit = require('express-rate-limit')
const http = require('http')
const globalSchema = require('./models/globalSchema')
const csrf = require('csurf');
var MongoStore = require("rate-limit-mongo");
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const userSchema = require('./models/users')
const fs = require('node:fs')
const { wss } = require('./ws');
const slowDown = require('express-slow-down');
const cors = require('cors');
require('dotenv').config();

const apiLimiter = rateLimit({
    store: new MongoStore({
      uri: process.env.MONGO_URL,
      collectionName: "rate-limit",
      expireTimeMs: 60 * 60 * 1000,
      resetExpireDateOnChange: true,
    }),
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: {
      error: true,
      message: "Too many requests, please try again later.",
    },
    headers: true,
    skipSuccessfulRequests: true,
});

const options = {
	cert: fs.readFileSync(path.join(__dirname, 'cert.pem')),
	key: fs.readFileSync(path.join(__dirname, 'key.pem'))
}

const server = http.createServer(options, app);

const bodyParser = require('body-parser');
//database
require(`./database`)
require('./passport/passport-local')
//settings
app.set(`view engine`, `ejs`)
app.set(`views`, path.join(__dirname, `views`))
app.set('trust proxy', 1);


const sessionOptions = {
    domain: 'rbxplus.com',
    secret: 'robloxwebdsd', // Cambia esto a una clave secreta real
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        secure: true, // Cambia a true si usas HTTPS
        httpOnly: true,
        sameSite: 'Strict'
    },
};



//middlewares
app.use(cookieParser());

app.use(apiLimiter);
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            "default-src": ["'self'"],
            "script-src": [
                "'self'",
                "'unsafe-inline'",
                "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com",
                "https://ajax.googleapis.com",
                "https://www.googletagmanager.com",
                "https://cdn.lineicons.com",
                "https://tr.rbxcdn.com/",
                "https://www.google-analytics.com/",
                "https://unpkg.com/",
                "https://static.cloudflareinsights.com/",
                "https://cdn.cpx-research.com/assets/js/",
                "https://code.jquery.com/",
                "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/"
            ],
            "script-src-attr": ["'unsafe-inline'"],
            "style-src": [
                "'self'",
                "'unsafe-inline'", // Esto permite estilos inline
                "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com",
                "https://ajax.googleapis.com",
                "https://www.googletagmanager.com",
                "https://cdn.lineicons.com",
                "https://tr.rbxcdn.com/",
                "https://unpkg.com/",
                "https://fonts.googleapis.com/"
            ],
            "img-src": [
                "'self'",
                "data:",
                "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com",
                "https://ajax.googleapis.com",
                "https://www.googletagmanager.com",
                "https://cdn.lineicons.com",
                "https://tr.rbxcdn.com/",
                "https://unpkg.com/",
                "https://thumbnails.roblox.com/",
                "https://t7.rbxcdn.com/"
            ],
            "connect-src": [
                "'self'",
                "https://www.google-analytics.com/",
            ],
            "font-src": [
                "'self'",
                "https://fonts.googleapis.com",
                "https://fonts.gstatic.com",
                "https://cdn.lineicons.com/",
                "https://unpkg.com/",
                "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/"
            ],
            "object-src": ["'none'"],
            "media-src": ["'self'"],
            "frame-src": [
                "'self'",
                "https://wall.adgaterewards.com/",
                "https://wall.lootably.com/",
                "https://offers.cpx-research.com/",
                "https://www.ayetstudios.com/"
            ],
            "form-action": ["'self'"],
            "upgrade-insecure-requests": []
        }
    },
    frameguard: { action: 'deny' },
    hsts: {
        maxAge: 63072000,
        includeSubDomains: true,
        preload: true
    },
    dnsPrefetchControl: { allow: true },
    expectCt: {
        enforce: true,
        maxAge: 30
    },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(cors({
    origin: 'https://rbxplus.com',
    optionsSuccessStatus: 200
}));
app.use("/public",express.static("public"))
app.use(morgan('combined'));
app.use(session(sessionOptions));
app.use(express.json())
app.use(flash())
app.use(passport.initialize())
app.use((err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
        res.status(401).json({ message: 'Invalid or missing token' });
    } else {
        next(err);
    }
});
app.use(async (req, res, next) => {
    if (req.session.user) {
        await userSchema.updateOne({ user: req.session.user.username }, { lastActivity: Date.now() });
    }
    next();
});
app.use(bodyParser.urlencoded({ extended: false }))
app.use(express.urlencoded({extended: false}))
app.use((req, res, next) => {
    res.locals.successMessages = req.flash('success')
    res.locals.errorMessages = req.flash('error')
    next();
})

//routes
app.use(`/`, require(`./routes/users.js`))
app.use(`/admin`, require(`./routes/admins.js`))
app.use((req, res, next) => {
    res.status(404).render('partials/notfound.ejs')
})
//Server


const port = process.env.SERVER_PORT || 5000

server.listen(port, ()=>{
    console.log(`listening on port ${port}`)
})
