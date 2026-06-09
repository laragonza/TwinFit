import { ObjectId } from "mongodb";
import { AnthropometricProfile, CoreBodyMeasures } from "./anthropometry.ts";

export interface UserSchema {
    _id: ObjectId;
    name: string;
    height: number;
    weight?: number;
    anthropometricProfile: AnthropometricProfile;
    measures: CoreBodyMeasures;
    gender: 'male' | 'female';
}
