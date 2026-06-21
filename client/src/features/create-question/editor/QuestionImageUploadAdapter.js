import { uploadImage } from '../utils/image/uploadImage.js';

/**
 * CKEditor upload adapter — validates via uploadImage() before URL enters editor HTML.
 */
export class QuestionImageUploadAdapter {
  /** @param {import('@ckeditor/ckeditor5-upload').FileLoader} loader */
  constructor(loader) {
    this.loader = loader;
    this.controller = new AbortController();
  }

  async upload() {
    const file = await this.loader.file;
    const url = await uploadImage(file);
    return { default: url };
  }

  abort() {
    this.controller.abort();
  }
}

/**
 * Registers the question-bank upload adapter with CKEditor FileRepository.
 *
 * @param {import('ckeditor5').Editor} editor
 */
export function registerQuestionImageUploadAdapter(editor) {
  const fileRepository = editor.plugins.get('FileRepository');
  fileRepository.createUploadAdapter = (loader) => new QuestionImageUploadAdapter(loader);
}
