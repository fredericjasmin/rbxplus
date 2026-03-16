const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const Admin = require('../models/adminSchema'); // Modelo de administrador

passport.use(new LocalStrategy(
  async function(username, password, done) {
    try {
      const admin = await Admin.findOne({ username });
      if (!admin) {
        return done(null, false, { message: 'Incorrect username.' });
      }
      if (!await admin.verifyPassword(password)) { // Asegúrate de que `verifyPassword` sea un método válido
        return done(null, false, { message: 'Incorrect password.' });
      }
      return done(null, admin); // Solo se pasa el admin sin serializar
    } catch (err) {
      return done(err);
    }
  }
));