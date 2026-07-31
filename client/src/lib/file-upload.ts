export const uploadFiles = async (files: File[]): Promise<string[]> => {
  const formData = new FormData();
  
  files.forEach((file) => {
    formData.append('damagePhotos', file);
  });

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    const result = await response.json();
    return result.filenames;
  } catch (error) {
    console.error('File upload error:', error);
    throw error;
  }
};

export const validateFiles = (files: File[]): string[] => {
  const errors: string[] = [];
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];

  files.forEach((file, index) => {
    if (file.size > maxSize) {
      errors.push(`File ${index + 1} is too large. Maximum size is 10MB.`);
    }
    
    if (!allowedTypes.includes(file.type)) {
      errors.push(`File ${index + 1} is not a supported image format. Use JPG, PNG, or GIF.`);
    }
  });

  return errors;
};
