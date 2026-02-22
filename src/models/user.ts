import mongoose from "mongoose";
const {Schema} = mongoose

const userSchema = new Schema({
    email: {type: String,
        unique: true,
        required: true
    },
    username: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    conversations: [{
        type: Schema.Types.ObjectId,
        ref: 'Conversation'
    }]
})

export const User = mongoose.model("User", userSchema)