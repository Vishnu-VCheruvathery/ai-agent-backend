import fs from 'fs'
import { encode } from 'gpt-tokenizer'
import {Poppler} from 'node-poppler'
import {createWorker} from 'tesseract.js'
import { summarizeModel } from '../agent/ai.js'
import { SystemMessage } from '@langchain/core/messages'



type Message = {
  content?: string | null
  conversationId: string
 
}
const poppler = new Poppler()

const pdfToPics = async(filepath: string, name: string) => {
       const options = {
        pngFile: true
       }
       
       const outputFile = process.cwd() + `/images/${name}`  
        try {
             await poppler.pdfToCairo(filepath, outputFile ,options)
        } catch (error) {
            console.log('Error while creating directory:', error);
        }
}

function chunkText(text:string, maxTokens = 500, overlap=50){
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let currentChunk:string[] = [];
    let tokenCount = 0;

    for(const sentence of sentences){
        const tokens = encode(sentence).length;
        if(tokenCount + tokens > maxTokens){
            chunks.push(currentChunk.join(" "));
            currentChunk = currentChunk.slice(-overlap);
            tokenCount = encode(currentChunk.join(" ")).length;
        }

        currentChunk.push(sentence);
        tokenCount += tokens;
    }

    if(currentChunk.length){
        chunks.push(currentChunk.join(" "));
    }

    return chunks;
}


const extractText = async(imagePath: string) => {
       try {
           const worker = await createWorker('eng');
           const result = await worker.recognize(imagePath);
           const chunks = chunkText(result.data.text, 500, 50)   
           await worker.terminate();
           return chunks
       } catch (error) {
        console.error('Error during OCR processing: ', error);
       }
}

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

export {pdfToPics, extractText, summarize}