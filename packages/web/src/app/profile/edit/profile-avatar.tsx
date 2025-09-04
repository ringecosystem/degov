"use client";

import ImageComponent from "next/image";
import { useRef, useState, useCallback, useEffect } from "react";
import { toast } from "react-toastify";

import { AddressAvatar } from "@/components/address-avatar";
import { Button } from "@/components/ui/button";

import type { Address } from "viem";

const IMAGE_CONFIG = {
  maxWidth: 800,
  maxHeight: 800,
  quality: 0.7,
  acceptedFormats: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
  ],
  maxSizeMB: 20,
};

interface ProfileAvatarProps {
  address?: Address;
  initialAvatar?: string | null;
  onAvatarChange: (base64: string) => void;
  isLoading: boolean;
}

export function ProfileAvatar({
  address,
  initialAvatar,
  onAvatarChange,
  isLoading,
}: ProfileAvatarProps) {
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(
    initialAvatar || undefined
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!IMAGE_CONFIG.acceptedFormats.includes(file.type)) {
        toast.error("Please upload a JPG, PNG, GIF or WebP image.");
        return;
      }

      if (file.size > IMAGE_CONFIG.maxSizeMB * 1024 * 1024) {
        toast.error(`Maximum file size is ${IMAGE_CONFIG.maxSizeMB}MB.`);
        return;
      }

      try {
        setIsProcessing(true);

        const base64 = await compressImage(file);
        setPreviewUrl(base64);
        onAvatarChange(base64);
      } catch (error) {
        console.error("Error processing image:", error);
        toast.error("Image processing failed");
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [onAvatarChange]
  );

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > IMAGE_CONFIG.maxWidth) {
            height = (height * IMAGE_CONFIG.maxWidth) / width;
            width = IMAGE_CONFIG.maxWidth;
          }

          if (height > IMAGE_CONFIG.maxHeight) {
            width = (width * IMAGE_CONFIG.maxHeight) / height;
            height = IMAGE_CONFIG.maxHeight;
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          const outputFormat =
            file.type === "image/png" ? "image/png" : "image/jpeg";
          const base64 = canvas.toDataURL(outputFormat, IMAGE_CONFIG.quality);
          resolve(base64);
        };

        img.onerror = () => {
          reject(new Error("Failed to load image"));
        };

        img.src = event.target?.result as string;
      };

      reader.onerror = () => {
        reject(new Error("Failed to read file"));
      };

      reader.readAsDataURL(file);
    });
  };

  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  useEffect(() => {
    if (initialAvatar) {
      setPreviewUrl(initialAvatar);
    }

    return () => {
      setPreviewUrl(undefined);
    };
  }, [initialAvatar]);

  return (
    <div className="flex h-[207px] flex-col items-center justify-center gap-[20px] rounded-[14px] bg-card p-[20px] shadow-card">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept={IMAGE_CONFIG.acceptedFormats.join(",")}
        className="hidden"
        disabled={isProcessing}
      />

      <div className="relative h-[110px] w-[110px] overflow-hidden rounded-full">
        {previewUrl ? (
          <ImageComponent
            src={previewUrl}
            alt="Profile avatar"
            className="h-full w-full object-cover"
            width={110}
            height={110}
          />
        ) : (
          address && (
            <AddressAvatar
              address={address}
              className="h-[110px] w-[110px] rounded-full"
              size={110}
            />
          )
        )}

        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent border-foreground"></div>
          </div>
        )}
      </div>

      <Button
        variant="outline"
        className="w-full rounded-[100px]"
        onClick={handleButtonClick}
        isLoading={isProcessing || isLoading}
      >
        {isProcessing ? "Processing..." : "Upload Avatar"}
      </Button>
    </div>
  );
}
