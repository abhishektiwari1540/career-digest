export interface PublishPayload {
  contentId?: string;
  text: string;
  mediaUrl?: string;
  hashtags?: string[];
  title?: string;
}

export interface PublishResult {
  id: string;
  url?: string;
  platform: string;
  success: boolean;
  error?: string;
}

export interface SocialPublisher {
  platform: string;
  publish(payload: PublishPayload): Promise<PublishResult>;
}
