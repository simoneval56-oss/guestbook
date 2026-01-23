"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Props = {
  initialUrl?: string | null;
  inputName?: string;
};

export function PropertyImagePicker({ initialUrl = null, inputName = "main_image_file" }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return objectUrl;
    });
  };

  const displayUrl = previewUrl || initialUrl;

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      {displayUrl ? (
        <Image
          src={displayUrl}
          alt="Immagine struttura"
          width={120}
          height={80}
          unoptimized
          style={{ objectFit: "cover", borderRadius: 10, border: "1px solid #d6e7ea" }}
        />
      ) : (
        <div
          style={{
            width: 120,
            height: 80,
            borderRadius: 10,
            border: "1px dashed #d6e7ea",
            display: "grid",
            placeItems: "center",
            color: "#6a8a94",
            fontSize: 12
          }}
        >
          Nessuna immagine
        </div>
      )}
      <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
        Carica immagine
        <input type="file" name={inputName} accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
      </label>
    </div>
  );
}
