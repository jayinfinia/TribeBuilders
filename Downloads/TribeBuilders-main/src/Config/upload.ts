import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Create uploads directory if it doesn't exist
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Create subdirectories for different file types
const subDirs = ['personas', 'transcripts', 'temp'];
subDirs.forEach(dir => {
  const dirPath = path.join(uploadDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = path.join(uploadDir, 'temp');
    
    // Determine upload path based on file purpose
    if (req.route?.path?.includes('persona')) {
      uploadPath = path.join(uploadDir, 'personas');
    } else if (req.route?.path?.includes('transcript')) {
      uploadPath = path.join(uploadDir, 'transcripts');
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

// File filter function
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allowed file types
  const allowedTypes = [
    'text/plain',           // .txt
    'text/csv',            // .csv
    'application/json',     // .json
    'application/pdf',      // .pdf
    'text/markdown',       // .md
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword'    // .doc
  ];

  // Check file type
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}. Allowed types: txt, csv, json, pdf, md, doc, docx`));
  }
};

// Multer configuration
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files per request
  }
});

// File processing utilities
export const FileProcessors = {
  // Process text files
  processTextFile: async (filePath: string): Promise<string> => {
    try {
      return fs.promises.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Error reading text file: ${error}`);
    }
  },

  // Process CSV files
  processCsvFile: async (filePath: string): Promise<any[]> => {
    const csvParser = require('csv-parser');
    const results: any[] = [];
    
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (data: any) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', (error: Error) => reject(error));
    });
  },

  // Process JSON files
  processJsonFile: async (filePath: string): Promise<any> => {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Error parsing JSON file: ${error}`);
    }
  },

  // Process PDF files
  processPdfFile: async (filePath: string): Promise<string> => {
    try {
      const pdfParse = require('pdf-parse');
      const buffer = await fs.promises.readFile(filePath);
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      throw new Error(`Error parsing PDF file: ${error}`);
    }
  },

  // Clean up uploaded file
  cleanupFile: async (filePath: string): Promise<void> => {
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      console.error(`Error cleaning up file ${filePath}:`, error);
    }
  }
};

// Helper function to determine processor based on file type
export const getFileProcessor = (mimetype: string) => {
  switch (mimetype) {
    case 'text/plain':
    case 'text/markdown':
      return FileProcessors.processTextFile;
    case 'text/csv':
      return FileProcessors.processCsvFile;
    case 'application/json':
      return FileProcessors.processJsonFile;
    case 'application/pdf':
      return FileProcessors.processPdfFile;
    default:
      return FileProcessors.processTextFile;
  }
};