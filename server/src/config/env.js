import dotenv from "dotenv";

dotenv.config();

const required = [
  "NODE_ENV",
  "PORT",
  "MONGODB_URI",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "PHI_ENCRYPTION_KEY"
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const env = {
  nodeEnv: process.env.NODE_ENV,
  port: Number(process.env.PORT),
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN,
  phiEncryptionKey: process.env.PHI_ENCRYPTION_KEY,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173"
};

export default env;
