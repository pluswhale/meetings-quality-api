import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum MeetingPhase {
  DISCUSSION = 'discussion',
  EMOTIONAL_EVALUATION = 'emotional_evaluation',
  UNDERSTANDING_CONTRIBUTION = 'understanding_contribution',
  TASK_PLANNING = 'task_planning',
  FINISHED = 'finished',
}

export enum MeetingStatus {
  UPCOMING = 'upcoming',
  ACTIVE = 'active',
  FINISHED = 'finished',
}

// Phase 2: Emotional Evaluation - Participant evaluates all other participants
@Schema({ _id: false })
export class ParticipantEmotionalEvaluation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  targetParticipantId: Types.ObjectId;

  @Prop({ required: true, min: -100, max: 100 })
  emotionalScale: number; // -100 (red/negative) to 100 (green/positive)

  @Prop({ default: false })
  isToxic: boolean;
}

export const ParticipantEmotionalEvaluationSchema = SchemaFactory.createForClass(ParticipantEmotionalEvaluation);

@Schema({ _id: false })
export class EmotionalEvaluation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  participantId: Types.ObjectId;

  @Prop({ type: [ParticipantEmotionalEvaluationSchema], default: [] })
  evaluations: ParticipantEmotionalEvaluation[];

  @Prop({ default: Date.now })
  submittedAt: Date;
}

export const EmotionalEvaluationSchema = SchemaFactory.createForClass(EmotionalEvaluation);

// Phase 3: Understanding & Contribution - Personal understanding + influence distribution
@Schema({ _id: false })
export class ContributionInfluence {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  participantId: Types.ObjectId;

  @Prop({ required: true, min: 0, max: 100 })
  contributionPercentage: number;
}

export const ContributionInfluenceSchema = SchemaFactory.createForClass(ContributionInfluence);

@Schema({ _id: false })
export class UnderstandingContribution {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  participantId: Types.ObjectId;

  @Prop({ required: true, min: 0, max: 100 })
  understandingScore: number;

  @Prop({ type: [ContributionInfluenceSchema], default: [] })
  contributions: ContributionInfluence[];

  @Prop({ default: Date.now })
  submittedAt: Date;
}

export const UnderstandingContributionSchema = SchemaFactory.createForClass(UnderstandingContribution);

// Phase 4: Task Planning - Task with deadline and expected contribution
@Schema({ _id: false })
export class TaskPlanning {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  participantId: Types.ObjectId;

  @Prop({ required: true })
  taskDescription: string;

  @Prop({ required: true })
  deadline: Date;

  @Prop({ required: true, min: 0, max: 100 })
  expectedContributionPercentage: number;

  @Prop({ default: Date.now })
  submittedAt: Date;
}

export const TaskPlanningSchema = SchemaFactory.createForClass(TaskPlanning);

// Active Participant tracking with timestamps
@Schema({ _id: false })
export class ActiveParticipant {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  participantId: Types.ObjectId;

  @Prop({ default: Date.now })
  joinedAt: Date;

  @Prop({ default: Date.now })
  lastSeen: Date;
}

export const ActiveParticipantSchema = SchemaFactory.createForClass(ActiveParticipant);

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

  @Prop({ type: [ActiveParticipantSchema], default: [] })
  activeParticipants: ActiveParticipant[];

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

  @Prop({ type: [EmotionalEvaluationSchema], default: [] })
  emotionalEvaluations: EmotionalEvaluation[];

  @Prop({ type: [UnderstandingContributionSchema], default: [] })
  understandingContributions: UnderstandingContribution[];

  @Prop({ type: [TaskPlanningSchema], default: [] })
  taskPlannings: TaskPlanning[];

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const MeetingSchema = SchemaFactory.createForClass(Meeting);
