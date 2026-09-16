'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Camera, DollarSign, Search, Shield } from 'lucide-react';
import CatalogTab from './catalog-tab';
import AppraiseTab from './appraise-tab';
import SearchTab from './search-tab';
import AuthenticateTab from './authenticate-tab';

export default function AdminAIPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-display-sm">AI Tools</h1>
        <p className="text-muted-foreground mt-1">
          AI-powered cataloging, appraisal, search, and authentication. The chat concierge is configured under Settings → AI.
        </p>
      </div>

      <Tabs defaultValue="catalog">
        <TabsList className="mb-6">
          <TabsTrigger value="catalog" className="gap-2"><Camera className="h-4 w-4" /> Catalog</TabsTrigger>
          <TabsTrigger value="appraise" className="gap-2"><DollarSign className="h-4 w-4" /> Appraise</TabsTrigger>
          <TabsTrigger value="search" className="gap-2"><Search className="h-4 w-4" /> AI Search</TabsTrigger>
          <TabsTrigger value="authenticate" className="gap-2"><Shield className="h-4 w-4" /> Authenticate</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog"><CatalogTab /></TabsContent>
        <TabsContent value="appraise"><AppraiseTab /></TabsContent>
        <TabsContent value="search"><SearchTab /></TabsContent>
        <TabsContent value="authenticate"><AuthenticateTab /></TabsContent>
      </Tabs>
    </div>
  );
}
