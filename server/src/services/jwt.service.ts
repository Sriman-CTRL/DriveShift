
import jwt from "jsonwebtoken";
import { env } from "../config/env";


export interface JwtPayload {
    userId: string;
    email: string;
}





class JwtService {
    generate(payload: JwtPayload) {
        return jwt.sign(payload, env.JWT_SECRET, {
            expiresIn: "7d"
        })
    }

}

export const jwtService = new JwtService();