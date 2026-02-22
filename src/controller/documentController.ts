import { Request, Response } from "express";
import { uploadQueue } from "../worker/src.js";
import { GoogleGenAI } from "@google/genai";
import { ocrCollection } from "../models/chromaCollection.js";
import { Message } from "../models/message.js";

const ai = new GoogleGenAI({});

export const uploadDocument = async(req: Request,res: Response) => {
    try {
        const file = req.file;
        const convId = req.body.convId;
        
         if(!file){
            return res.status(400).json({message: 'No file uploaded'})
         }

         await uploadQueue.add('upload', {file,  convId});
          

        return res.status(200).json({message: 'File uploaded successfully!'})
    } catch (error) {
        console.error('Error :', error);
        return res.status(500).json({message: 'Internal Server Error'})
    }
}

export const askAI = async(req:Request, res: Response) => {
  
      const {question, conversation_id} = req.body;
    
    try {
        const col = await ocrCollection;
        const resultFromDB = await col.query({
  nResults: 3,
  queryTexts: [question],
  include: ["documents", "metadatas",]
    });


    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Use the following context to answer the question:\n\n${resultFromDB.documents.join("\n")}
        \n\nMetadata:\n\n${JSON.stringify(resultFromDB.metadatas)}
        \n\nQuestion: ${question}\n\nAnswer:`,
    })

  
    await Message.create({
        conversationId: conversation_id,
        content: question,
        role: 'user'
    })
    
   await Message.create({
        conversationId: conversation_id,
        content: response.text,
        role: 'ai'
    })
  
 
    return res.status(200).json({answer: response.text})
    } catch (error) {
        console.error('Error :', error);
        return res.status(500).json({message: 'Internal Server Error'})
    }
}

