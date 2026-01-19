import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum MeetingPhase {
  DISCUSSION = 'discussion',
  EVALUATION = 'evaluation',
  SUMMARY = 'summary',
  FINISHED = 'finished',
}

export enum MeetingStatus {
  UPCOMING = 'upcoming',
  ACTIVE = 'active',
  FINISHED = 'finished',
}

@Schema({ _id: false })
export class EmotionalEvaluation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  targetParticipantId: Types.ObjectId;

  @Prop({ required: true, min: -100, max: 100 })
  emotionalScale: number; // -100 (red/negative) to 100 (green/positive)

  @Prop({ default: false })
  isToxic: boolean;
}

export const EmotionalEvaluationSchema = SchemaFactory.createForClass(EmotionalEvaluation);

@Schema({ _id: false })
export class UnderstandingInfluence {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  participantId: Types.ObjectId;

  @Prop({ required: true, min: 0, max: 100 })
  influencePercentage: number;
}

export const UnderstandingInfluenceSchema = SchemaFactory.createForClass(UnderstandingInfluence);

@Schema({ _id: false })
export class Evaluation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  participantId: Types.ObjectId;

  @Prop({ required: true, min: 0, max: 100 })
  understandingScore: number;

  @Prop({ type: [UnderstandingInfluenceSchema], default: [] })
  influences: UnderstandingInfluence[];

  @Prop({ type: [EmotionalEvaluationSchema], default: [] })
  emotionalEvaluations: EmotionalEvaluation[];

  @Prop({ default: Date.now })
  submittedAt: Date;
}

export const EvaluationSchema = SchemaFactory.createForClass(Evaluation);

@Schema({ _id: false })
export class Summary {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  participantId: Types.ObjectId;

  @Prop({ required: true })
  taskDescription: string;

  @Prop({ required: true })
  deadline: Date;

  @Prop({ required: true, min: 0, max: 100 })
  contributionImportance: number;

  @Prop({ default: Date.now })
  submittedAt: Date;
}

export const SummarySchema = SchemaFactory.createForClass(Summary);

export type MeetingDocument = Meeting & Document;

@Schema({ timestamps: true })
export class Meeting {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  question: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  participantIds: Types.ObjectId[];

  @Prop({ 
    type: String, 
    enum: Object.values(MeetingPhase), 
    default: MeetingPhase.DISCUSSION 
  })
  currentPhase: MeetingPhase;

  @Prop({ 
    type: String, 
    enum: Object.values(MeetingStatus), 
    default: MeetingStatus.UPCOMING 
  })
  status: MeetingStatus;

  @Prop({ type: [EvaluationSchema], default: [] })
  evaluations: Evaluation[];

  @Prop({ type: [SummarySchema], default: [] })
  summaries: Summary[];

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const MeetingSchema = SchemaFactory.createForClass(Meeting);
