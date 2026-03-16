const { model, Schema} = require(`mongoose`)
const passesSchema = new Schema({
    username: {
        type: String
    },
    robuxAmount: {
        type: Number,
        default: 0
    },
    passName: {
        type: String,
    },
    gameId: {
        type: String,
    },
    passId: {
        type: String
    },
    passPrice: {
        type: Number,
    },
    passImage: {
        type: String,
    },
    waitingForPayment: {
        type: Boolean,
        default: true
    },
    paid: {
        type: Boolean,
        default: false
    },
    id: String,
})
 
module.exports = model(`passes`, passesSchema)