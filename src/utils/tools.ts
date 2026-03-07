import fs from 'fs'

import { summarizeModel } from '../agent/ai.js'
import { SystemMessage } from '@langchain/core/messages'
import { S3Client } from '@aws-sdk/client-s3'



type Message = {
  content?: string | null
  conversationId: string
 
}

 const s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY!,
        secretAccessKey: process.env.AWS_SECRET_KEY!,
    },
 });

const summarize = async(messages: Message[]) => {
   
    try {
        let summaryText = '';
        messages.map((message) => summaryText += message.content + '\n' )
        const result = await summarizeModel.invoke([
            new SystemMessage('Create a short summary of this huge string made of multiple messages to store in the vector DB'),
            summaryText
        ])

        return result;
    } catch (error) {
         console.error('Error during Summarzing: ', error);
    }
}

export {summarize, s3Client}