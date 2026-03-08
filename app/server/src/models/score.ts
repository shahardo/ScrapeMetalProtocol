import { Schema, model, type Document, type Types } from 'mongoose'

const scoreSchema = new Schema(
  {
    userId:   { type: String, required: true, index: true },
    username: { type: String, required: true },
    score:    { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
)

export interface ScoreDocument extends Document {
  _id: Types.ObjectId
  userId: string
  username: string
  score: number
  createdAt: Date
}

export const ScoreModel = model<ScoreDocument>('Score', scoreSchema)
