import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Camera, X } from "lucide-react";

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
}

export function AttachmentPicker({ files, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const append = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onChange([...files, ...Array.from(list)]);
  };

  const remove = (idx: number) => {
    onChange(files.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          <Paperclip className="h-4 w-4 mr-2" /> Anexar ficheiro
        </Button>
        <Button type="button" variant="outline" onClick={() => camRef.current?.click()}>
          <Camera className="h-4 w-4 mr-2" /> Tirar foto
        </Button>
        <input
          ref={fileRef} type="file" multiple accept="*/*" className="hidden"
          onChange={(e) => { append(e.target.files); e.target.value = ""; }}
        />
        <input
          ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { append(e.target.files); e.target.value = ""; }}
        />
      </div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {files.map((f, i) => {
            const isImg = f.type.startsWith("image/");
            const url = isImg ? URL.createObjectURL(f) : null;
            return (
              <div key={i} className="relative group border rounded-md p-1 bg-muted/30">
                {isImg && url ? (
                  <img src={url} alt={f.name} className="h-16 w-16 object-cover rounded" />
                ) : (
                  <div className="h-16 w-16 flex items-center justify-center text-[10px] text-muted-foreground text-center px-1 break-all">
                    {f.name.slice(0, 20)}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
                  aria-label="Remover"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
