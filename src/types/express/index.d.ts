import { JwtPayload } from "jsonwebtoken";

const {Schema} = mongoose
export type decodedToken = {
    id: String
}

type SummarizableMessage = {
  role: "user" | "ai" | "system";
  content: string;
};


declare global {
    namespace Express {
        interface Request {
            decoded?: decodedToken | JwtPayload
        }
    }
}