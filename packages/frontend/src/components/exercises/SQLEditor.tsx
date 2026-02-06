import Editor from '@monaco-editor/react';

interface SQLEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
}

export default function SQLEditor({ value, onChange, height = '200px' }: SQLEditorProps) {
  return (
    <div className="border border-gray-300 rounded overflow-hidden">
      <Editor
        height={height}
        defaultLanguage="sql"
        theme="vs-light"
        value={value}
        onChange={(value) => onChange(value || '')}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2
        }}
      />
    </div>
  );
}
