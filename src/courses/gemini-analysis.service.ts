import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';

import { GoogleGenAI } from '@google/genai';



@Injectable()

export class GeminiAnalysisService {

  private readonly logger = new Logger(GeminiAnalysisService.name);

  private ai: GoogleGenAI;

 

  private projectId = 'gen-lang-client-0247762738';

  private location = 'global';



  constructor() {

    this.ai = new GoogleGenAI({

      vertexai: true,

      project: this.projectId,

      location: this.location

    });

  }



  async evaluateCandidate(

    audioGcsUri: string,

    snapshotUris: string[],

    scriptDocumentGcsUri: string,

    scriptMimeType: string,      

    totalMarks: number,
    
    scriptText?: string

  ): Promise<any> {

   

    // We dynamically inject ${totalMarks} into the prompt instructions and schema

    const promptText = `

      You are an expert evaluator assessing a candidate's video performance.

     

      I have provided:

      1. The extracted audio track of the candidate speaking.

      2. A series of image snapshots taken at 10-second intervals from the video.

      3. The reference script document that the candidate was instructed to read.

     

      Analyze the candidate based on the following criteria:

      1. Posture & Dress Code: Analyze the visual snapshots for professionalism, dress code, attitude, posture, and facial expressions.

      2. Voice Tone & Filler Words: Listen to the audio to detect confidence, voice clarity, tone, and identify verbal fillers like "aaa", "ummm", "ah", or long hesitations/pauses. Mention the count and specific instances of these fillers.

      3. Script Accuracy: Cross-reference the audio speech directly against the provided script document for skipped words, stumbles, or exact matches.

     

      SCORING RULES:

      The maximum possible overall score for this evaluation is ${totalMarks}.

      You must calculate the final score out of ${totalMarks} based on the candidate's performance across the three criteria.

     

      You must respond ONLY with a valid JSON object matching this exact schema:

      {

        "postureScore": <number>,

        "postureFeedback": "<string detailing visual analysis>",

        "attitudeScore": <number>,

        "attitudeFeedback": "<string detailing tone, clarity, and hesitations>",

        "accuracyScore": <number>,

        "accuracyFeedback": "<string detailing script comparison>",

        "overallScore": <number strictly between 0 and ${totalMarks}>

      }

    `;



    // Map all modalities into the payload: Text + Audio + PDF/Images (DOCX/PPTX passed as text)

    const parts: any[] = [

      { text: promptText },

      { fileData: { mimeType: 'audio/mp3', fileUri: audioGcsUri } },

      ...snapshotUris.map(uri => ({

        fileData: { mimeType: 'image/jpeg', fileUri: uri }

      }))

    ];
    
    if (scriptText) {
      parts.push({ text: `\n\nREFERENCE SCRIPT DOCUMENT TEXT:\n${scriptText}` });
    } else {
      parts.push({ fileData: { mimeType: scriptMimeType, fileUri: scriptDocumentGcsUri } });
    }



    try {

      this.logger.log(`Dispatching multimodal payload to Gemini. Max marks: ${totalMarks}`);

     

      const response = await this.ai.models.generateContent({

        model: 'gemini-3.5-flash',

        contents: [

          { role: 'user', parts }

        ],

        config: {

          temperature: 0.1,

          responseMimeType: 'application/json',

        }

      });

     

      const rawText = response.text;



      if (!rawText) {

        throw new Error('Gemini API returned an empty text response.');

      }

     

      this.logger.log('Successfully received evaluation from Gemini.');

     

      const cleanedText = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();

      return JSON.parse(cleanedText);



    } catch (error) {

      this.logger.error('Gemini Analysis failed:', error);

      throw new InternalServerErrorException('Failed to analyze candidate performance.');

    }

  }

}