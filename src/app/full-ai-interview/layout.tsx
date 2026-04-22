import { Toaster } from '@/components/ui/sonner';

export default function FullAiInterviewLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <div className="min-h-screen bg-white">
        {children}
      </div>
      <Toaster />
    </>
  );
}
