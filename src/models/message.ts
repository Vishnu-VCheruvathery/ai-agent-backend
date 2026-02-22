import mongoose from "mongoose";
const {Schema} = mongoose

const messageSchema = new Schema({
    conversationId: {
        type: Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    role: {type: String, enum: ['user', 'ai']},
    content: String,
    createdAt: {type: Date, default: Date.now},
    summarized: {Boolean}
})

export const Message = mongoose.model("Message", messageSchema)