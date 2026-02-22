import 'dotenv/config'
import { Request, Response } from "express";
import { User } from "../models/user.js";
import bcrypt from "bcryptjs";
import jwt from 'jsonwebtoken'
import { Conversation } from '../models/conversations.js';
import { Message } from '../models/message.js';
import { decodedToken } from '../types/express/index.js';

const isProd = process.env.NODE_ENV === "production";

export const signUp = async(req: Request,res: Response) => {
    const {username, password, email} = req.body;
    if(!username || !password){
        return res.status(400).json({message: 'Please provide full credentials!'})
    }
    
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt)
       const newUser = await User.create({
        username,
        password: hashedPassword,
        email
       })
       const accessToken = jwt.sign({id: newUser._id}, process.env.ACCESS_SECRET!, {
        expiresIn: '10m'
       })
           const refreshToken = jwt.sign({username: newUser.username}, process.env.REFRESH_SECRET!, {expiresIn: '1d'})

          res.cookie('refresh', refreshToken, {
           httpOnly: true,
           sameSite: isProd ? "none" : "lax",
           secure: isProd,
          maxAge: 24 * 60 * 60 * 1000,
          })
       return res.status(200).json({message: 'User created successfully!', accessToken})
    } catch (error) {
         console.error('Error :', error);
        return res.status(500).json({message: 'Internal Server Error'})
    }
}

export const login = async(req: Request, res: Response) => {
    const {email, password} = req.body;
    console.log(req.body)
    if(!email || !password){
        return res.status(400).json({message: 'Please provide full credentials!'})
    }
    try {
        const user = await User.findOne({email});
        if(!user){
            return res.status(400).json({message: 'No user found!'})
        }

    
          const match = await bcrypt.compare(password, user.password!)
        
          if(!match){
            return res.status(400).json({message: "Wrong password!"})
          }
        
          const accessToken = jwt.sign({id: user._id}, process.env.ACCESS_SECRET!, {expiresIn: '10m'})
          const refreshToken = jwt.sign({id: user._id}, process.env.REFRESH_SECRET!, {expiresIn: '1d'})

          res.cookie('refresh', refreshToken, {
              httpOnly: true,
              sameSite: isProd ? "none" : "lax",
              secure: isProd,
              maxAge: 24 * 60 * 60 * 1000,
          })
          return res.status(200).json({message: 'Login successful!', accessToken})
    } catch (error) {
        console.error('Error :', error);
        return res.status(500).json({message: 'Internal Server Error'})
    }
}

export const logout = async(req: Request, res: Response) => {
    try {
        res.cookie('refresh', {
            httpOnly: true,
           sameSite: isProd ? "none" : "lax",
           secure: isProd,
        })
       
        return res.status(200).json({message: 'User logged out!'})
    } catch (error) {
        console.log(error);
         return res.status(500).json({message: 'Internal Server Error'})
    }
}

export const refresh = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refresh;
    if (!refreshToken) {
      return res.status(401).json({ message: "No refresh token" });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_SECRET!
    ) as decodedToken;

    const accessToken = jwt.sign(
      { id: decoded.id },
      process.env.ACCESS_SECRET!,
      { expiresIn: "10m" }
    );

    return res.json({ accessToken });
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
};


export const createConversation = async(req: Request, res: Response) => {
    const {id} = req.decoded as decodedToken
    const {title} = req.body;
    if(!title || title.length === 0){
        return res.status(400).json({message: 'No title provided!'})
    }
    try {
        const newConvo = await Conversation.create({
            title,
            userId: id
        })

        return res.status(200).json({conversation: newConvo})
    } catch (error) {
        console.error('Error :', error);
        return res.status(500).json({message: 'Internal Server Error'})
    }
}

export const getConversations = async(req: Request, res: Response) => {
    const {id} = req.decoded as decodedToken
    if(!id){
        return res.status(400).json({error: 'Authorization error!'})
    }
    try {
        const conversations = await Conversation.find({userId: id})
        return res.status(200).json(conversations)
    } catch (error) {
        console.error('Error :', error);
        return res.status(500).json({message: 'Internal Server Error'})
    }
}

export const getMessages = async(req: Request, res: Response) => {
    const {id} = req.query;
    if(!id){
        return res.status(400).json({message: 'No conversation found!'})
    }
    try {
        const messages = await Message.find({conversationId: id})
        return res.status(200).json(messages)
    } catch (error) {
        console.error('Error :', error);
        return res.status(500).json({message: 'Internal Server Error'})
    }
}
