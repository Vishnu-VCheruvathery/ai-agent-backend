import express from "express";
import { uploadDocument } from "../controller/documentController.js";
import multer from "multer";
const upload = multer({dest: 'uploads/'})

const router = express.Router();

router.post('/upload', upload.single('file'),uploadDocument);


export default router;