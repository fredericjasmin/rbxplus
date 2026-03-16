const { model, Schema} = require(`mongoose`)
const promoCodeSchema = new Schema({
    code: {
        type: String,
        required: true
    },
    uses: {
        type: Number,
        required: true,
        default: 0
    },
    maxUses: {
        type: Number,
        required: true
    },
    expired: {
        type: Boolean,
        default: false
    },
    robux: {
        type: Number,
        required: true
    },
    redeemedBy: {
        type: [String],
    },
    isCreator: {
        type: Boolean,
        default: false,
    },
    date: { type: Date, default: Date.now },
})
 
module.exports = model(`promocodes`, promoCodeSchema)