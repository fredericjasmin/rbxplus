const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Define el esquema de administrador
const adminSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    role: {
        type: String,
        enum: ['superadmin', 'admin'],
        default: 'admin'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Middleware para encriptar la contraseña antes de guardar
adminSchema.pre('save', async function (next) {
    if (this.isModified('password') || this.isNew) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }
    next();
});

// Método para comparar la contraseña ingresada con la almacenada
adminSchema.methods.verifyPassword = async function (password) {
    return await bcrypt.compare(password, this.password);
};

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;