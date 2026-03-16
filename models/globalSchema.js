const { model, Schema } = require('mongoose');

const totalDonatedSchema = new Schema({
    totalRobux: {
        type: Number,
        required: true,
        default: 0
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

module.exports = model('totalDonated', totalDonatedSchema);