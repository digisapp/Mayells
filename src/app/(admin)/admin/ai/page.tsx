'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Camera, DollarSign, Search, Shield } from 'lucide-react';
import CatalogTab from './catalog-tab';
import AppraiseTab from './appraise-tab';
import SearchTab from './search-tab';
import AuthenticateTab from './authenticate-tab';
import { PageHeader } from '@/components/admin/PageHeader';

export default function AdminAIPage() {
  return (
    <div>
      <PageHeader
        title="AI assist"
        description="Quick one-off checks: catalogue, appraise, search and authenticate. Results aren't saved — use the AI actions on a prospect or lot to keep them."
      />

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
