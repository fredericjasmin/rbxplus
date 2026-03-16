const { model, Schema} = require(`mongoose`)

const surveySchema = new Schema({
    userId: String,
    offerId: String,
    amount: Number,
    date: Date,
    status: {
        type: String,
        enum: ['pending', 'completed'],
        default: 'pending'
    },
});

const transactionSchema = new Schema({
    username: String,
    robuxAmount: Number,
    status: {
        type: String,
        enum: ['pending', 'completed'],
        default: 'pending'
    },
    passId: String,
    passName: String,
    passPrice: Number,
    passImage: String,
    date: { type: Date, default: Date.now },
    transactionId: String
});

const referralSchema = new Schema({
    referredUser: {
        type: String,
        required: true
    },
    earnings: {
        type: Number,
        required: true,
        default: 0
    },
    date: {
        type: Date,
        default: Date.now
    }
});


const accountSchema = new Schema({
    user: {
        type: String,
        required: true
    },
    points: {
        type: Number,
        required: true,
        default: 0
    },
    imageUrl: String,
    robloxId: {
        type: String,
        required: true
    },
    pointsAtStartOfDay: {
        type: Number,
        required: true,
        default: 0
    },
    pointsAtStartOfWeek: {
        type: Number,
        required: true,
        default: 0
    },
    actions: [{
        action: String,
        date: { type: Date, default: Date.now }
    }],
    transactions: [transactionSchema],
    surveys: [surveySchema],
    updatedAt: {
        type: Date
    },
    lastActivity: {
        type: Date
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    referralCode: {
        type: String
    },
    referredBy: {
        type: String
    },
    totalReferredUsers: {
        type: Number,
        default: 0
    },
    referralEarned: {
        type: Number,
        default: 0
    },
    referrals: [referralSchema],
    tasks: {
        task1: {
            progress: { type: Number, default: 0 },
            completed: { type: Boolean, default: false },
            claimed: { type: Boolean, default: false },  
        },
        task2: {
            progress: { type: Number, default: 0 },
            completed: { type: Boolean, default: false },
            claimed: { type: Boolean, default: false },
        },
        task3: {
            progress: { type: Number, default: 0 },
            completed: { type: Boolean, default: false },
            claimed: { type: Boolean, default: false },
        },
        task4: {
            progress: { type: Number, default: 0 },
            completed: { type: Boolean, default: false },
            claimed: { type: Boolean, default: false },
        },
    },
    tickets: {
        type: Number,
        default: 0
    },
    hasRedeemedCreatorCode: { type: Boolean, default: false },
});

accountSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});
 
module.exports = model(`users`, accountSchema)