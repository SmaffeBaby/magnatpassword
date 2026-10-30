export type InputFieldType = 'text' | 'multiline' | 'url' | 'date' | 'number' | 'checkbox'
export interface InputField { id:string; label:string; type:InputFieldType; value:string }
export interface InputAttachment { id:string; name:string; type:string; size:number; path:string; createdAt:string }
export interface InputCard { id:string; title:string; description:string; fields:InputField[]; attachments:InputAttachment[]; createdAt:string; updatedAt:string; createdBy:string }
export interface ProjectInputs { revision:number; updatedAt:string|null; cards:InputCard[] }
