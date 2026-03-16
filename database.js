const mongoose = require(`mongoose`)

const connect = mongoose.connect(process.env.MONGO_URL)

connect.then(()=>{
    console.log(`database connected`)
})
.catch(()=>{
    console.log(`error connecting database`)
})

module.exports = mongoose