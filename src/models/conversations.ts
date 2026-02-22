import mongoose from "mongoose";
const {Schema} = mongoose

const conversationSchema = new Schema({
   title: String,
   userId: {type: Schema.Types.ObjectId, ref: 'User'},
   createdAt: {type:Date, default: Date.now}
   
})

export const Conversation = mongoose.model("Conversation", conversationSchema)