import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import session from "express-session";
import multer from "multer";
import passport from "./auth/passport.js";
import authRoutes from "./routes/auth.routes.js";
import driveRoutes from "./routes/drive.routes.js";
import migrationRoutes from "./routes/migration.routes.js";
import { env } from "./config/env.js";

const app = express();

// Core middleware
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

// Session middleware — must come before routes so req.session is available
app.use(
  session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

// Passport middleware — must come after session
app.use(passport.initialize());
app.use(passport.session());

// Routes — registered after all middleware is set up
app.use("/auth", authRoutes);
app.use("/drive", driveRoutes);
app.use("/migrations", migrationRoutes);

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Everything is good",
  });
});

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    console.error("[upload-debug] Multer error", {
      code: err.code,
      field: err.field,
      message: err.message,
      contentType: req.headers["content-type"],
    });

    return res.status(400).json({
      message: "File upload failed",
      code: err.code,
      field: err.field,
      details: err.message,
    });
  }

  next(err);
});

export default app;