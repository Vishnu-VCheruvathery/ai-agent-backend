import express from "express";
import cors from "cors";
import documentRouter from "./routes/documentRoutes.js";
import userRouter from "./routes/userRoutes.js"
const allowedOrigins = ['http://localhost:5173', process.env.FRONTEND_URL]


const app = express();

app.use(cors({
    origin: function (origin, callback){
        if(!origin) return callback(null, true);
        if(allowedOrigins.indexOf(origin) === -1){
             const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
          return callback(new Error(msg), false);
        }
        return callback(null, true)
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));  
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", documentRouter);
app.use("/api/users", userRouter)

export default app;