import { env } from "./config/env.js";
import app from "./app.js";
import "./migration/migration.worker";

const PORT = env.PORT;

app.listen(PORT, () => {
    console.log(`🚀 DriveShift API running on port ${PORT}`);
});
