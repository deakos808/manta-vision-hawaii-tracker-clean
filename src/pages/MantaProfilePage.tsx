import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase, getImageUrl, MantaIndividual, Sighting } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { ArrowUp } from 'lucide-react';
import { getCurrentUser } from '@/lib/supabase';

const MantaProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const [tabValue, setTabValue] = useState('info');
  
  // Check if user is authenticated for edit capabilities
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: getCurrentUser,
  });
  
  // Fetch manta data
  const { data: manta, isLoading: mantaLoading } = useQuery({
    queryKey: ['manta', id],
    queryFn: async () => {
      if (!id) throw new Error('No manta ID provided');
      
      const { data, error } = await supabase
        .from('manta_individuals')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error) {
        console.error('Error fetching manta:', error);
        throw error;
      }
      
      return data as MantaIndividual;
    },
    enabled: !!id,
  });
  
  // Fetch sightings for this manta
  const { data: sightings, isLoading: sightingsLoading } = useQuery({
    queryKey: ['mantaSightings', id],
    queryFn: async () => {
      if (!id) throw new Error('No manta ID provided');
      
      const { data, error } = await supabase
        .from('sightings')
        .select('*')
        .eq('manta_id', id)
        .order('sighting_date', { ascending: false });
        
      if (error) {
        console.error('Error fetching manta sightings:', error);
        throw error;
      }
      
      return data as Sighting[];
    },
    enabled: !!id,
  });
  
  if (!id) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold mb-2">Manta Not Found</h1>
        <p className="text-muted-foreground mb-6">No manta ID was provided</p>
        <Button asChild>
          <Link to="/mantas">View All Mantas</Link>
        </Button>
      </div>
    );
  }
  
  const isLoading = mantaLoading || sightingsLoading;
  
  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row gap-8">
          <Skeleton className="w-full md:w-[300px] h-[300px] rounded-lg" />
          <div className="space-y-4 flex-1">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
            <div className="space-y-2 mt-6">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (!manta) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold mb-2">Manta Not Found</h1>
        <p className="text-muted-foreground mb-6">No manta with ID: {id}</p>
        <Button asChild>
          <Link to="/mantas">View All Mantas</Link>
        </Button>
      </div>
    );
  }
  
  // Find most recent sighting for profile photo
  const profileImage = sightings && sightings.length > 0 && sightings[0].image_url 
    ? getImageUrl(sightings[0].image_url) 
    : null;
  
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link to="/mantas" className="text-sm text-ocean hover:underline mb-2 inline-block">
            ← Back to Catalog
          </Link>
          <h1 className="text-2xl font-bold">Manta Profile: {manta.name || `ID: ${manta.id}`}</h1>
        </div>
        
        {user && (
          <Button variant="outline" size="sm">
            Edit Profile
          </Button>
        )}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <Card className="lg:col-span-1">
          <CardContent className="p-6">
            {profileImage ? (
              <img 
                src={profileImage} 
                alt={`Manta ${manta.name || manta.id}`}
                className="w-full h-auto rounded-lg mb-4"
              />
            ) : (
              <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center mb-4">
                <p className="text-muted-foreground">No profile image</p>
              </div>
            )}
            
            <div className="space-y-3">
              <div>
                <h3 className="font-medium text-sm text-muted-foreground">ID</h3>
                <p>{manta.id}</p>
              </div>
              
              <div>
                <h3 className="font-medium text-sm text-muted-foreground">Name</h3>
                <p>{manta.name || 'Unnamed'}</p>
              </div>
              
              <div>
                <h3 className="font-medium text-sm text-muted-foreground">Gender</h3>
                <p className="capitalize">{manta.gender}</p>
              </div>
              
              <div>
                <h3 className="font-medium text-sm text-muted-foreground">Age Class</h3>
                <p className="capitalize">{manta.age_class}</p>
              </div>
              
              <div>
                <h3 className="font-medium text-sm text-muted-foreground">Species</h3>
                <p>{manta.species}</p>
              </div>
              
              <div>
                <h3 className="font-medium text-sm text-muted-foreground">First Sighted</h3>
                <p>{sightings && sightings.length > 0 
                  ? new Date(sightings[sightings.length - 1].sighting_date).toLocaleDateString() 
                  : 'Unknown'}</p>
              </div>
              
              <div>
                <h3 className="font-medium text-sm text-muted-foreground">Last Sighted</h3>
                <p>{sightings && sightings.length > 0 
                  ? new Date(sightings[0].sighting_date).toLocaleDateString() 
                  : 'Unknown'}</p>
              </div>
              
              <div>
                <h3 className="font-medium text-sm text-muted-foreground">Total Sightings</h3>
                <p>{sightings?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-2">
          <CardHeader>
            <Tabs value={tabValue} onValueChange={setTabValue}>
              <TabsList>
                <TabsTrigger value="info">Information</TabsTrigger>
                <TabsTrigger value="sightings">Sightings ({sightings?.length || 0})</TabsTrigger>
                <TabsTrigger value="photos">Photos</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <TabsContent value="info" className="mt-0">
              <div className="prose dark:prose-invert max-w-none">
                <h3>About This Manta</h3>
                <p>
                  This profile contains information about manta ray {manta.name || `ID: ${manta.id}`}, 
                  a {manta.age_class} {manta.gender} manta ray primarily observed in Hawaiian waters.
                </p>
                
                <h3>Distinctive Features</h3>
                <p>
                  {manta.notes || 'Information about distinctive markings and features will be available in a future update.'}
                </p>
                
                <h3>Conservation Status</h3>
                <p>
                  Manta rays are listed as vulnerable on the IUCN Red List and face threats including 
                  fishing pressure, habitat degradation, and climate change impacts.
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="sightings" className="mt-0">
              {sightings && sightings.length > 0 ? (
                <div className="space-y-4">
                  {sightings.map((sighting) => (
                    <Link 
                      key={sighting.id} 
                      to={`/sighting/${sighting.id}`}
                      className="block"
                    >
                      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="flex-shrink-0 w-20 h-20 bg-muted rounded-md overflow-hidden">
                            {sighting.image_url && (
                              <img 
                                src={getImageUrl(sighting.image_url) || ''} 
                                alt={`Sighting ${sighting.id}`}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{new Date(sighting.sighting_date).toLocaleDateString()}</p>
                            <p className="text-sm text-muted-foreground">
                              {sighting.location || 'Unknown location'}
                            </p>
                            {sighting.behavior && (
                              <p className="text-sm">
                                <span className="text-muted-foreground">Behavior:</span> {String(sighting.behavior)}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No sightings recorded for this manta yet</p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="photos" className="mt-0">
              {sightings && sightings.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {sightings
                    .filter(sighting => sighting.image_url)
                    .map((sighting) => (
                      <Link 
                        key={sighting.id} 
                        to={`/sighting/${sighting.id}`}
                        className="block aspect-square bg-muted rounded-md overflow-hidden hover:opacity-90 transition-opacity"
                      >
                        {sighting.image_url && (
                          <img 
                            src={getImageUrl(sighting.image_url) || ''} 
                            alt={`Sighting ${sighting.id}`}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </Link>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No photos available for this manta yet</p>
                </div>
              )}
            </TabsContent>
          </CardContent>
        </Card>
      </div>
      
      <div className="flex justify-center my-8">
        <Button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <ArrowUp className="h-4 w-4" />
          Back to top
        </Button>
      </div>
    </div>
  );
};

export default MantaProfilePage;
