import { ObjectId } from "mongodb";

export interface UserSchema {
    _id: ObjectId;
    name: string;
    height: number;
    weight?: number;
    measures: {
        chest: number;
        waist: number;
        hips: number;
    };
    gender: 'male' | 'female';
}
