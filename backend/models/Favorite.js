import mongoose from "mongoose";

const favoriteSchema = new mongoose.Schema(
  {
    city: { type: String, required: true, trim: true },
    cityNormalized: { type: String, required: true, lowercase: true, trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true }
);

favoriteSchema.index(
  { user: 1, cityNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: {
      user: { $exists: true },
      cityNormalized: { $exists: true, $type: "string" },
    },
  },
);

const Favorite = mongoose.model("Favorite", favoriteSchema);

export default Favorite;
