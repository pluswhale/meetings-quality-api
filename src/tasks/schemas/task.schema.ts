import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TaskDocument = Task & Document;

@Schema({ timestamps: true })
export class Task {
  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  commonQuestion: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Meeting', required: true })
  meetingId: Types.ObjectId;

  @Prop({ required: true })
  deadline: Date;

  @Prop({ required: true, min: 0, max: 100 })
  contributionImportance: number;

  @Prop({ default: false })
  isCompleted: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const TaskSchema = SchemaFactory.createForClass(Task);
