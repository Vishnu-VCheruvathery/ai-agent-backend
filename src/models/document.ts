import mongoose from "mongoose";
const {Schema} = mongoose

const documentSchema = new Schema({
    title: String,
    type: String,
})

export const Document = mongoose.model("Document", documentSchema)