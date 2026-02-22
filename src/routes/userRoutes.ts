import express from "express";
import { createConversation, getConversations, getMessages, login, logout, refresh, signUp } from "../controller/userController.js";
import verifyToken from "../utils/verify.js";

const router = express.Router();

router.post('/sign-in', signUp)
router.post('/login', login)
router.post('/logout', logout)
router.post('/create/conv', verifyToken, createConversation)
router.get('/conversations', verifyToken, getConversations)
router.get('/messages', getMessages)
router.post('/refresh', refresh)

export default router