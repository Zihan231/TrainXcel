import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';

@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);
  
  // We grab the API key directly from your environment variables
  private apiKey = process.env.GOOGLE_SPEECH_API_KEY;

  async transcribeAudio(audioFilePath: string): Promise<string> {
    this.logger.log(`Starting transcription via REST for: ${audioFilePath}`);

    try {
      // 1. Read and encode the audio file
      const fileBuffer = fs.readFileSync(audioFilePath);
      const audioBytes = fileBuffer.toString('base64');

      // 2. Configure the HTTP Payload
      const payload = {
        audio: {
          content: audioBytes,
        },
        config: {
          encoding: 'MP3',
          sampleRateHertz: 16000, 
          languageCode: 'en-US', 
          enableWordTimeOffsets: true, 
        },
      };

      // 3. Make the POST request directly to the REST endpoint using the API Key
      this.logger.log('Sending request to Google REST API...');
      
      const response = await fetch(`https://speech.googleapis.com/v1/speech:longrunningrecognize?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const operationData = await response.json();

      if (operationData.error) {
        throw new Error(`Google API Error: ${operationData.error.message}`);
      }

      const operationName = operationData.name;
      this.logger.log(`Operation started with ID: ${operationName}. Polling for completion...`);

      // 4. Poll the operation endpoint until Google finishes processing
      const transcript = await this.pollForResults(operationName);
      
      this.logger.log('Transcription completed successfully.');
      return transcript;

    } catch (error) {
      this.logger.error('Speech-to-Text API failed:', error);
      throw error;
    }
  }

  /**
   * Helper function to wait for the long-running operation to finish
   */
  private async pollForResults(operationName: string): Promise<string> {
    let isComplete = false;
    let finalTranscript = '';

    while (!isComplete) {
      // Wait 5 seconds between checks to avoid spamming the API
      await new Promise(resolve => setTimeout(resolve, 5000));
      this.logger.log('Checking operation status...');

      const checkResponse = await fetch(`https://speech.googleapis.com/v1/operations/${operationName}?key=${this.apiKey}`);
      const checkData = await checkResponse.json();

      if (checkData.error) {
        throw new Error(checkData.error.message);
      }

      if (checkData.done) {
        isComplete = true;
        
        // Log the raw data so you can see the timestamps!
        console.log("=== RAW GOOGLE SPEECH RESPONSE ===");
        console.log(JSON.stringify(checkData.response, null, 2));
        console.log("==================================");

        // Combine the transcript chunks
        finalTranscript = checkData.response?.results
          ?.map((result: any) => result.alternatives?.[0]?.transcript)
          .join('\n') || '';
      }
    }

    return finalTranscript;
  }
}