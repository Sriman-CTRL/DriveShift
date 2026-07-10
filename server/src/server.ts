import dotenv from "dotenv";
import app from "./app";
import { env } from "./config/env";

console.log("CLIENT ID:", env.GOOGLE_CLIENT_ID); // Temporary

dotenv.config();

const PORT = env.PORT;

app.listen(PORT, () => {
    console.log(`🚀 DriveShift API running on port ${PORT}`);
});
