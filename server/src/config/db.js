import mongoose from "mongoose";

export const connectDb = async (mongoUri) => {
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri);
};
