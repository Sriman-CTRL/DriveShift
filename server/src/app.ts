import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import passport from "./config/passport";
import session from "express-session";
import authRoutes from "./routes/auth.routes";

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

// Routes
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "OK",
        message: "Everything is good"
    });
});

export default app;