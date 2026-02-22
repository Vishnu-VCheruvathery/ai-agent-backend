import { NextFunction, Request, Response } from "express";
import jwt from 'jsonwebtoken'
import { decodedToken } from "../types/express/index.js";

const verifyToken = function(req: Request, res: Response, next: NextFunction){
    const token = req.headers.authorization?.split(' ')[1]
    console.log('the token in headers: ', req.headers.authorization)
    if(!token){
        return res.status(404).json({error: 'Authorization error, token not in headers'})
    }
    jwt.verify(token, process.env.ACCESS_SECRET!, function(err, decoded){
        if(err){
            return res.status(401).json({error: 'Authorization failed'})
        }
        
        req.decoded = decoded as decodedToken
        next()
    })
}

export default verifyToken