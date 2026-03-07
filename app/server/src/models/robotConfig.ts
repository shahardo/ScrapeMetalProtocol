import { Schema, model, type Document, type Types } from 'mongoose'

// ── Sub-document schema ───────────────────────────────────────────────────────

const robotPartSchema = new Schema(
  {
    id:         { type: String, required: true },
    type:       { type: String, required: true },
    health:     { type: Number, required: true },
    maxHealth:  { type: Number, required: true },
    weight:     { type: Number, required: true },
    armor:      { type: Number, required: true },
    isDetached: { type: Boolean, required: true, default: false },
  },
  { _id: false },
)

// ── Main schema ───────────────────────────────────────────────────────────────

const robotConfigSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    name:   { type: String, required: true, trim: true, maxlength: 40 },
    parts:  { type: [robotPartSchema], required: true },
  },
  { timestamps: true },
)

// ── TypeScript interface ───────────────────────────────────────────────────────

export interface RobotPartDoc {
  id: string
  type: string
  health: number
  maxHealth: number
  weight: number
  armor: number
  isDetached: boolean
}

export interface RobotConfigDocument extends Document {
  _id: Types.ObjectId
  userId: string
  name: string
  parts: RobotPartDoc[]
  createdAt: Date
  updatedAt: Date
}

export const RobotConfigModel = model<RobotConfigDocument>('RobotConfig', robotConfigSchema)
