'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Settings, Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AppHeaderProps {
  title: string;
  showBackButton?: boolean;
  showSettings?: boolean;
  showNotifications?: boolean;
}

export default function AppHeader({ 
  title, 
  showBackButton = true,
  showSettings = true,
  showNotifications = true
}: AppHeaderProps) {
  const router = useRouter();

  const handleGoBack = () => {
    router.back();
  };

  const handleOpenSettings = () => {
    router.push('/settings');
  };

  const handleOpenNotifications = () => {
    router.push('/notifications');
  };

  return (
    <motion.header 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="flex items-center justify-between h-16 px-4 bg-card border-b border-border"
    >
      <div className="flex items-center gap-3">
        {showBackButton && (
          <button 
            onClick={handleGoBack}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-transparent hover:bg-primary/10"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
        )}
        <h1 className="text-lg font-medium text-white game-subtitle">{title}</h1>
      </div>
      
      <div className="flex items-center gap-2">
        {showNotifications && (
          <button 
            onClick={handleOpenNotifications}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-transparent hover:bg-primary/10"
          >
            <Bell className="w-5 h-5 text-white" />
          </button>
        )}
        
        {showSettings && (
          <button 
            onClick={handleOpenSettings}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-transparent hover:bg-primary/10"
          >
            <Settings className="w-5 h-5 text-white" />
          </button>
        )}
      </div>
    </motion.header>
  );
}
