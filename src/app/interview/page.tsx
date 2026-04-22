"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InterviewPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/interview/room");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
        <p className="text-gray-600">正在跳转到面试室...</p>
      </div>
    </div>
  );
}
