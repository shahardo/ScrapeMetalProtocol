import { Schema, model, type Document, type Types } from 'mongoose'

const userSchema = new Schema(
  {
    username:     { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 20 },
    passwordHash: { type: String, required: true },
    isAdmin:      { type: Boolean, default: false },
  },
  { timestamps: true },
)

export interface UserDocument extends Document {
  _id: Types.ObjectId
  username: string
  passwordHash: string
  isAdmin: boolean
  createdAt: Date
  updatedAt: Date
}

export const UserModel = model<UserDocument>('User', userSchema)
